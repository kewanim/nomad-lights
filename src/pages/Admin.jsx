import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import { signOut } from "firebase/auth";
import { Eye, EyeOff, FolderPlus, Plus, Trash2, UploadCloud } from "lucide-react";
import { auth, db, storage } from "../firebase/firebase";

/* ----------------------------------------------------------
   Default categories — seeded into Firestore on first admin load
   ---------------------------------------------------------- */
const DEFAULT_CATEGORIES = [
  "Portraits",
  "Couples",
  "Events",
  "Proposals",
  "Graduation",
];

/* ----------------------------------------------------------
   Compress image before upload (saves free storage quota)
   ---------------------------------------------------------- */
async function compressImage(file, maxPx = 1920, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width >= height) {
          height = Math.round((height * maxPx) / width);
          width = maxPx;
        } else {
          width = Math.round((width * maxPx) / height);
          height = maxPx;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) =>
          resolve(
            new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
              type: "image/jpeg",
            })
          ),
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

/* ----------------------------------------------------------
   Single image card in the gallery grid
   ---------------------------------------------------------- */
function AdminImageCard({
  image,
  allCategories,
  foldersForCat,
  onDelete,
  onCategoryChange,
  onFolderChange,
}) {
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName]   = useState("");

  function handleFolderSelect(e) {
    if (e.target.value === "__new__") {
      setCreatingFolder(true);
    } else {
      onFolderChange(image, e.target.value);
    }
  }

  function confirmNewFolder() {
    const name = newFolderName.trim();
    if (name) {
      onFolderChange(image, name);
      setCreatingFolder(false);
      setNewFolderName("");
    }
  }

  return (
    <div className="admin-image-card">
      <img
        src={image.imageUrl}
        alt={image.title || image.category}
        loading="lazy"
      />
      <div className="admin-image-card-info">
        <span className="admin-image-card-cat">{image.category}</span>

        {image.folder && (
          <span className="admin-folder-badge">📁 {image.folder}</span>
        )}

        <span className="admin-image-card-title">
          {image.title || "Untitled"}
        </span>

        {/* Change category */}
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            fontSize: "0.76rem",
            color: "var(--gray)",
          }}
        >
          Category
          <select
            value={image.category || ""}
            onChange={(e) => onCategoryChange(image, e.target.value)}
          >
            {allCategories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {/* Change folder */}
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            fontSize: "0.76rem",
            color: "var(--gray)",
          }}
        >
          Folder
          {creatingFolder ? (
            <div className="admin-folder-input-row">
              <input
                className="admin-folder-input"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && confirmNewFolder()}
              />
              <button className="admin-folder-save-btn" onClick={confirmNewFolder}>
                Save
              </button>
              <button
                className="admin-folder-cancel-btn"
                onClick={() => {
                  setCreatingFolder(false);
                  setNewFolderName("");
                }}
              >
                ✕
              </button>
            </div>
          ) : (
            <select value={image.folder || ""} onChange={handleFolderSelect}>
              <option value="">No folder</option>
              {foldersForCat.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
              <option value="__new__">+ Create new folder…</option>
            </select>
          )}
        </label>

        <button onClick={() => onDelete(image)}>
          <Trash2 size={14} />
          Delete
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------
   Main Admin page
   ---------------------------------------------------------- */
export default function Admin({ user }) {
  // ── Firestore state ─────────────────────────────────────
  const [categories, setCategories] = useState([]);
  const [images, setImages]         = useState([]);

  // ── Upload form state ────────────────────────────────────
  const [uploadCat, setUploadCat]               = useState("");
  const [uploadFolder, setUploadFolder]         = useState("");
  const [creatingUploadFolder, setCreatingUploadFolder] = useState(false);
  const [newUploadFolder, setNewUploadFolder]   = useState("");
  const [title, setTitle]                       = useState("");
  const [status, setStatus]                     = useState("");
  const [uploading, setUploading]               = useState(false);
  const [dragOver, setDragOver]                 = useState(false);

  // ── Gallery filter ───────────────────────────────────────
  const [galleryFilter, setGalleryFilter] = useState("All");

  // ── New category form ────────────────────────────────────
  const [newCatName, setNewCatName] = useState("");
  const [savingCat, setSavingCat]   = useState(false);

  /* ── Seed default categories on first admin load ─────── */
  useEffect(() => {
    async function seedIfEmpty() {
      try {
        const snap = await getDocs(collection(db, "categories"));
        if (snap.empty) {
          for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
            await addDoc(collection(db, "categories"), {
              name:      DEFAULT_CATEGORIES[i],
              visible:   true,
              order:     i,
              createdAt: serverTimestamp(),
            });
          }
        }
      } catch (e) {
        console.warn("Could not seed categories:", e);
      }
    }
    seedIfEmpty();
  }, []); // runs once

  /* ── Listen: categories ──────────────────────────────── */
  useEffect(() => {
    const q = query(collection(db, "categories"), orderBy("order", "asc"));
    return onSnapshot(q, (snap) => {
      const cats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCategories(cats);
      // Auto-select first category for upload if nothing selected yet
      setUploadCat((prev) => prev || cats[0]?.name || DEFAULT_CATEGORIES[0]);
    });
  }, []);

  /* ── Listen: images ──────────────────────────────────── */
  useEffect(() => {
    const q = query(collection(db, "gallery"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setImages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  /* ── Derived ─────────────────────────────────────────── */
  const categoryNames = categories.length > 0
    ? categories.map((c) => c.name)
    : DEFAULT_CATEGORIES;

  // Unique sorted folder names per category
  const foldersByCat = useMemo(() => {
    const map = {};
    categoryNames.forEach((cat) => {
      const folders = [
        ...new Set(
          images
            .filter((img) => img.category === cat)
            .map((img) => img.folder || "")
            .filter(Boolean)
        ),
      ].sort();
      map[cat] = folders;
    });
    return map;
  }, [categoryNames, images]);

  // Image count per category (for filter badges + category panel)
  const countByCat = useMemo(() => {
    const map = { All: images.length };
    categoryNames.forEach((cat) => {
      map[cat] = images.filter((img) => img.category === cat).length;
    });
    return map;
  }, [categoryNames, images]);

  // Filtered images for gallery view
  const filteredImages = useMemo(() => {
    return galleryFilter === "All"
      ? images
      : images.filter((img) => img.category === galleryFilter);
  }, [images, galleryFilter]);

  /* ── Upload ──────────────────────────────────────────── */
  async function uploadFiles(files) {
    const selected = Array.from(files || []).filter((f) =>
      f.type.startsWith("image/")
    );
    if (!selected.length) {
      setStatus("Please choose image files only.");
      return;
    }

    // Resolve folder name for this upload batch
    const folderToUse = creatingUploadFolder
      ? newUploadFolder.trim()
      : uploadFolder;

    setUploading(true);

    for (const file of selected) {
      try {
        setStatus(`Compressing ${file.name}…`);
        const compressed = await compressImage(file);
        const origMB = (file.size / 1024 / 1024).toFixed(1);
        const compMB = (compressed.size / 1024 / 1024).toFixed(1);
        setStatus(`Uploading ${file.name} (${origMB} MB → ${compMB} MB)…`);

        const safeName = compressed.name
          .replace(/[^a-z0-9.-]/gi, "-")
          .toLowerCase();
        const filePath   = `gallery/${Date.now()}-${safeName}`;
        const storageRef = ref(storage, filePath);
        const uploadTask = uploadBytesResumable(storageRef, compressed);

        await new Promise((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snap) => {
              const pct = Math.round(
                (snap.bytesTransferred / snap.totalBytes) * 100
              );
              setStatus(`Uploading ${file.name} — ${pct}%`);
            },
            reject,
            resolve
          );
        });

        const imageUrl = await getDownloadURL(storageRef);

        await addDoc(collection(db, "gallery"), {
          title:       title || uploadCat,
          category:    uploadCat,
          folder:      folderToUse || "",
          imageUrl,
          storagePath: filePath,
          createdAt:   serverTimestamp(),
          createdBy:   user.email,
        });

        setStatus(`✓ ${file.name} uploaded`);
      } catch {
        setStatus(`Upload failed for ${file.name}. Please try again.`);
      }
    }

    setTitle("");
    setCreatingUploadFolder(false);
    setNewUploadFolder("");
    setUploading(false);
  }

  /* ── Delete image ────────────────────────────────────── */
  async function deleteImage(image) {
    if (!window.confirm("Delete this image from the website?")) return;
    try {
      await deleteDoc(doc(db, "gallery", image.id));
      if (image.storagePath) {
        await deleteObject(ref(storage, image.storagePath));
      }
    } catch {
      alert("Could not delete. Please try again.");
    }
  }

  /* ── Change category (clears folder) ────────────────── */
  async function changeCat(image, newCat) {
    try {
      await updateDoc(doc(db, "gallery", image.id), {
        category: newCat,
        folder:   "",   // folder belongs to a category, reset on move
      });
    } catch {
      alert("Could not update category.");
    }
  }

  /* ── Change folder ───────────────────────────────────── */
  async function changeFolder(image, newFolder) {
    try {
      await updateDoc(doc(db, "gallery", image.id), { folder: newFolder });
    } catch {
      alert("Could not update folder.");
    }
  }

  /* ── Toggle category visibility ─────────────────────── */
  async function toggleVisibility(cat) {
    try {
      await updateDoc(doc(db, "categories", cat.id), { visible: !cat.visible });
    } catch {
      alert("Could not update visibility.");
    }
  }

  /* ── Add new category ────────────────────────────────── */
  async function addCategory() {
    const name = newCatName.trim();
    if (!name) return;
    if (
      categories.some(
        (c) => c.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      alert("A category with that name already exists.");
      return;
    }
    try {
      setSavingCat(true);
      await addDoc(collection(db, "categories"), {
        name,
        visible:   false, // hidden by default until you add photos & turn it on
        order:     categories.length,
        createdAt: serverTimestamp(),
      });
      setNewCatName("");
    } catch {
      alert("Could not add category.");
    } finally {
      setSavingCat(false);
    }
  }

  /* ── Folder shorthand ────────────────────────────────── */
  const currentFolders = foldersByCat[uploadCat] || [];
  const resolvedUploadFolder = creatingUploadFolder
    ? newUploadFolder
    : uploadFolder;

  /* ─────────────────────────────────────────────────────── */
  return (
    <div className="admin-page">
      <div className="admin-container">

        {/* ── Top bar ── */}
        <div className="admin-top-bar">
          <div className="admin-top-bar-title">
            <h1>Nomad Lights Admin</h1>
            <p>Signed in as {user.email}</p>
          </div>
          <div className="admin-top-actions">
            <a className="btn btn-secondary" href="#/">
              View Website
            </a>
            <button className="btn btn-primary" onClick={() => signOut(auth)}>
              Logout
            </button>
          </div>
        </div>

        {/* ── Categories panel ── */}
        <div className="admin-panel">
          <h2>Session categories</h2>
          <p>
            Toggle visibility to show or hide a session type on your website.
            New categories are hidden by default — turn them on once you've
            added photos.
          </p>

          <div className="admin-cat-list">
            {categories.map((cat) => {
              const count = countByCat[cat.name] ?? 0;
              return (
                <div key={cat.id} className="admin-cat-row">
                  <div
                    className="admin-cat-dot"
                    style={{
                      background: cat.visible ? "#34c759" : "var(--border)",
                    }}
                  />
                  <div className="admin-cat-info">
                    <span className="admin-cat-name">{cat.name}</span>
                    <span className="admin-cat-count">
                      {count} photo{count !== 1 ? "s" : ""}
                      {count === 0 && (
                        <span className="admin-cat-hidden-note">
                          {" "}· hidden on website
                        </span>
                      )}
                    </span>
                  </div>
                  <button
                    className="admin-cat-toggle"
                    onClick={() => toggleVisibility(cat)}
                    title={
                      cat.visible
                        ? "Click to hide from website"
                        : "Click to show on website"
                    }
                  >
                    {cat.visible ? (
                      <Eye size={15} strokeWidth={1.75} />
                    ) : (
                      <EyeOff size={15} strokeWidth={1.75} />
                    )}
                    <span>{cat.visible ? "Visible" : "Hidden"}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add new category */}
          <div className="admin-cat-add-form">
            <input
              className="admin-cat-add-input"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="New category name (e.g. Maternity, Newborn…)"
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
            />
            <button
              className="btn btn-primary"
              onClick={addCategory}
              disabled={savingCat || !newCatName.trim()}
            >
              <Plus size={15} />
              Add
            </button>
          </div>
        </div>

        {/* ── Upload panel ── */}
        <div className="admin-panel">
          <h2>Add photos</h2>
          <p>
            Images are auto-compressed before uploading. You can assign a
            category and optionally place them in a folder within that category.
          </p>

          {/* Category + title */}
          <div className="admin-fields">
            <label>
              Category
              <select
                value={uploadCat}
                onChange={(e) => {
                  setUploadCat(e.target.value);
                  setUploadFolder("");
                  setCreatingUploadFolder(false);
                  setNewUploadFolder("");
                }}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Optional title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Downtown couples session"
              />
            </label>
          </div>

          {/* Folder selection */}
          <div className="admin-folder-row">
            <FolderPlus size={15} color="var(--gray)" />
            <span className="admin-folder-row-label">Folder</span>

            {!creatingUploadFolder ? (
              <select
                className="admin-folder-select"
                value={uploadFolder}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setCreatingUploadFolder(true);
                    setUploadFolder("");
                  } else {
                    setUploadFolder(e.target.value);
                  }
                }}
              >
                <option value="">No folder (general)</option>
                {currentFolders.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
                <option value="__new__">+ Create new folder…</option>
              </select>
            ) : (
              <div className="admin-folder-input-row">
                <input
                  className="admin-folder-input"
                  value={newUploadFolder}
                  onChange={(e) => setNewUploadFolder(e.target.value)}
                  placeholder="Folder name (e.g. Summer 2025)"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newUploadFolder.trim())
                      setCreatingUploadFolder(false);
                  }}
                />
                <button
                  className="admin-folder-save-btn"
                  onClick={() => {
                    if (newUploadFolder.trim())
                      setCreatingUploadFolder(false);
                  }}
                >
                  Save
                </button>
                <button
                  className="admin-folder-cancel-btn"
                  onClick={() => {
                    setCreatingUploadFolder(false);
                    setNewUploadFolder("");
                  }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Drop zone */}
          <label
            className={dragOver ? "drop-zone drag-active" : "drop-zone"}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              uploadFiles(e.dataTransfer.files);
            }}
          >
            <UploadCloud size={40} strokeWidth={1.25} />
            <strong>Drop images here</strong>
            <span>or tap to choose files</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => uploadFiles(e.target.files)}
            />
          </label>

          {/* Upload destination preview */}
          {uploadCat && (
            <p className="admin-upload-destination">
              → Uploading to{" "}
              <strong>{uploadCat}</strong>
              {resolvedUploadFolder && (
                <>
                  {" "}
                  › folder <strong>{resolvedUploadFolder}</strong>
                </>
              )}
            </p>
          )}

          {status && (
            <div className="upload-status">
              {uploading && <div className="loading-spinner" />}
              {status}
            </div>
          )}
        </div>

        {/* ── Gallery ── */}
        <div className="admin-gallery-section">
          <h2>
            Gallery ({images.length} photo
            {images.length !== 1 ? "s" : ""})
          </h2>

          {/* Category filter tabs */}
          <div className="admin-gallery-filters">
            {["All", ...categoryNames].map((cat) => (
              <button
                key={cat}
                className={`admin-gallery-filter-btn${
                  galleryFilter === cat ? " active" : ""
                }`}
                onClick={() => setGalleryFilter(cat)}
              >
                {cat}
                <span className="admin-filter-count">
                  {countByCat[cat] ?? 0}
                </span>
              </button>
            ))}
          </div>

          {filteredImages.length === 0 ? (
            <p className="admin-empty">
              {galleryFilter === "All"
                ? "No photos yet. Upload your first one above."
                : `No photos in ${galleryFilter} yet.`}
            </p>
          ) : (
            <div className="admin-image-grid">
              {filteredImages.map((img) => (
                <AdminImageCard
                  key={img.id}
                  image={img}
                  allCategories={categories}
                  foldersForCat={foldersByCat[img.category] || []}
                  onDelete={deleteImage}
                  onCategoryChange={changeCat}
                  onFolderChange={changeFolder}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
