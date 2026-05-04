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
  where,
  writeBatch,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import { signOut } from "firebase/auth";
import {
  Check,
  Edit2,
  Eye,
  EyeOff,
  FolderPlus,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { auth, db, storage } from "../firebase/firebase";

/* ----------------------------------------------------------
   Default categories — seeded into Firestore on first load
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
   AdminImageCard — hover overlay + expandable edit panel
   ---------------------------------------------------------- */
function AdminImageCard({
  image,
  allCategories,
  foldersForCat,
  onDelete,
  onCategoryChange,
  onFolderChange,
  onTitleChange,
}) {
  const [expanded,       setExpanded]       = useState(false);
  const [editTitle,      setEditTitle]      = useState(image.title || "");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName,  setNewFolderName]  = useState("");

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

  function saveTitle() {
    const t = editTitle.trim();
    if (t !== (image.title || "")) onTitleChange(image, t);
  }

  const displayTitle =
    image.title && image.title !== image.category
      ? image.title
      : image.category;

  return (
    <div className={`admin-image-card${expanded ? " expanded" : ""}`}>

      {/* ── Image + hover overlay ── */}
      <div className="admin-image-card-img-wrap">
        <img
          src={image.imageUrl}
          alt={displayTitle}
          loading="lazy"
        />
        <div className="admin-image-card-overlay">
          <button
            className="admin-img-overlay-btn edit"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Close editor" : "Edit photo"}
          >
            <Edit2 size={14} />
          </button>
          <button
            className="admin-img-overlay-btn delete"
            onClick={() => onDelete(image)}
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* ── Compact info strip ── */}
      <div className="admin-image-card-compact">
        <p className="admin-image-card-title-text">{displayTitle}</p>
        <div className="admin-image-card-chips">
          <span className="admin-chip cat-chip">{image.category}</span>
          {image.folder && (
            <span className="admin-chip folder-chip">📁 {image.folder}</span>
          )}
        </div>
      </div>

      {/* ── Expandable edit panel ── */}
      {expanded && (
        <div className="admin-image-card-panel">

          {/* Title */}
          <div className="admin-panel-field">
            <label>Title</label>
            <div className="admin-panel-input-row">
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveTitle()}
                placeholder="Photo title…"
              />
              <button
                className="admin-icon-btn confirm"
                onClick={saveTitle}
                title="Save title"
              >
                <Check size={13} />
              </button>
            </div>
          </div>

          {/* Category */}
          <div className="admin-panel-field">
            <label>Category</label>
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
          </div>

          {/* Folder */}
          <div className="admin-panel-field">
            <label>Folder</label>
            {creatingFolder ? (
              <div className="admin-folder-input-row">
                <input
                  className="admin-folder-input"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="New folder name"
                  autoFocus
                  onKeyDown={(e) =>
                    e.key === "Enter" && confirmNewFolder()
                  }
                />
                <button
                  className="admin-folder-save-btn"
                  onClick={confirmNewFolder}
                >
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
              <select
                value={image.folder || ""}
                onChange={handleFolderSelect}
              >
                <option value="">No folder</option>
                {foldersForCat.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
                <option value="__new__">+ Create new folder…</option>
              </select>
            )}
          </div>

          <button
            className="admin-panel-close"
            onClick={() => setExpanded(false)}
          >
            <X size={12} />
            Done editing
          </button>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------
   Main Admin page
   ---------------------------------------------------------- */
export default function Admin({ user }) {
  // ── Firestore state ─────────────────────────────────────
  const [categories, setCategories] = useState([]);
  const [images,     setImages]     = useState([]);

  // ── Upload form state ────────────────────────────────────
  const [uploadCat,              setUploadCat]              = useState("");
  const [uploadFolder,           setUploadFolder]           = useState("");
  const [creatingUploadFolder,   setCreatingUploadFolder]   = useState(false);
  const [newUploadFolder,        setNewUploadFolder]        = useState("");
  const [title,                  setTitle]                  = useState("");
  const [status,                 setStatus]                 = useState("");
  const [uploading,              setUploading]              = useState(false);
  const [dragOver,               setDragOver]               = useState(false);

  // ── Gallery filter ───────────────────────────────────────
  const [galleryFilter, setGalleryFilter] = useState("All");

  // ── New category form ────────────────────────────────────
  const [newCatName,  setNewCatName]  = useState("");
  const [savingCat,   setSavingCat]   = useState(false);

  // ── Rename category ──────────────────────────────────────
  const [renamingCatId,    setRenamingCatId]    = useState(null);
  const [renameCatValue,   setRenameCatValue]   = useState("");

  // ── Rename folder ────────────────────────────────────────
  const [renamingFolder,       setRenamingFolder]       = useState(null);
  const [renameFolderValue,    setRenameFolderValue]    = useState("");

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
  }, []);

  /* ── Listen: categories ──────────────────────────────── */
  useEffect(() => {
    const q = query(collection(db, "categories"), orderBy("order", "asc"));
    return onSnapshot(q, (snap) => {
      const cats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCategories(cats);
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

  const foldersByCat = useMemo(() => {
    const map = {};
    categoryNames.forEach((cat) => {
      map[cat] = [
        ...new Set(
          images
            .filter((img) => img.category === cat)
            .map((img) => img.folder || "")
            .filter(Boolean)
        ),
      ].sort();
    });
    return map;
  }, [categoryNames, images]);

  const countByCat = useMemo(() => {
    const map = { All: images.length };
    categoryNames.forEach((cat) => {
      map[cat] = images.filter((img) => img.category === cat).length;
    });
    return map;
  }, [categoryNames, images]);

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
        const safeName  = compressed.name.replace(/[^a-z0-9.-]/gi, "-").toLowerCase();
        const filePath  = `gallery/${Date.now()}-${safeName}`;
        const storRef   = ref(storage, filePath);
        const uploadTask = uploadBytesResumable(storRef, compressed);
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
        const imageUrl = await getDownloadURL(storRef);
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
        folder:   "",
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

  /* ── Change photo title ──────────────────────────────── */
  async function changeTitle(image, newTitle) {
    try {
      await updateDoc(doc(db, "gallery", image.id), {
        title: newTitle || image.category,
      });
    } catch {
      alert("Could not update title.");
    }
  }

  /* ── Toggle category visibility ─────────────────────── */
  async function toggleVisibility(cat) {
    try {
      await updateDoc(doc(db, "categories", cat.id), {
        visible: !cat.visible,
      });
    } catch {
      alert("Could not update visibility.");
    }
  }

  /* ── Add new category ────────────────────────────────── */
  async function addCategory() {
    const name = newCatName.trim();
    if (!name) return;
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      alert("A category with that name already exists.");
      return;
    }
    try {
      setSavingCat(true);
      await addDoc(collection(db, "categories"), {
        name,
        visible:   false,
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

  /* ── Rename category (batch: doc + all images) ───────── */
  async function renameCategory(cat, newName) {
    newName = newName.trim();
    if (!newName || newName === cat.name) {
      setRenamingCatId(null);
      return;
    }
    if (
      categories.some(
        (c) => c.id !== cat.id && c.name.toLowerCase() === newName.toLowerCase()
      )
    ) {
      alert("A category with that name already exists.");
      return;
    }
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "categories", cat.id), { name: newName });
      const q    = query(collection(db, "gallery"), where("category", "==", cat.name));
      const snap = await getDocs(q);
      snap.docs.forEach((d) => batch.update(d.ref, { category: newName }));
      await batch.commit();
      setRenamingCatId(null);
    } catch {
      alert("Could not rename category.");
    }
  }

  /* ── Rename folder (batch: all matching images) ──────── */
  async function renameFolder(catName, oldFolder, newFolder) {
    newFolder = newFolder.trim();
    if (!newFolder || newFolder === oldFolder) {
      setRenamingFolder(null);
      return;
    }
    try {
      const batch = writeBatch(db);
      const q     = query(
        collection(db, "gallery"),
        where("category", "==", catName),
        where("folder",   "==", oldFolder)
      );
      const snap = await getDocs(q);
      snap.docs.forEach((d) => batch.update(d.ref, { folder: newFolder }));
      await batch.commit();
      setRenamingFolder(null);
    } catch {
      alert("Could not rename folder.");
    }
  }

  /* ── Shorthand ───────────────────────────────────────── */
  const currentFolders        = foldersByCat[uploadCat] || [];
  const resolvedUploadFolder  = creatingUploadFolder ? newUploadFolder : uploadFolder;

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
            Toggle visibility to show/hide a session on your website. Click the{" "}
            <strong>pencil</strong> to rename. New categories are hidden by default
            until you turn them on.
          </p>

          <div className="admin-cat-list">
            {categories.map((cat) => {
              const count      = countByCat[cat.name] ?? 0;
              const isRenaming = renamingCatId === cat.id;

              return (
                <div key={cat.id} className="admin-cat-row">
                  <div
                    className="admin-cat-dot"
                    style={{
                      background: cat.visible ? "var(--green)" : "var(--border)",
                    }}
                  />

                  <div className="admin-cat-info">
                    {isRenaming ? (
                      <div className="admin-cat-rename-row">
                        <input
                          className="admin-cat-rename-input"
                          value={renameCatValue}
                          autoFocus
                          onChange={(e) => setRenameCatValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") renameCategory(cat, renameCatValue);
                            if (e.key === "Escape") setRenamingCatId(null);
                          }}
                        />
                        <button
                          className="admin-icon-btn confirm"
                          onClick={() => renameCategory(cat, renameCatValue)}
                          title="Save"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          className="admin-icon-btn"
                          onClick={() => setRenamingCatId(null)}
                          title="Cancel"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="admin-cat-name">{cat.name}</span>
                        <span className="admin-cat-count">
                          {count} photo{count !== 1 ? "s" : ""}
                          {count === 0 && (
                            <span className="admin-cat-hidden-note">
                              {" "}· hidden on website
                            </span>
                          )}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="admin-cat-actions">
                    {!isRenaming && (
                      <button
                        className="admin-cat-rename-btn"
                        onClick={() => {
                          setRenamingCatId(cat.id);
                          setRenameCatValue(cat.name);
                        }}
                        title="Rename category"
                      >
                        <Edit2 size={13} />
                      </button>
                    )}
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
            Images are auto-compressed before uploading. Assign a category and
            optionally place them in a folder within that category.
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
                    if (newUploadFolder.trim()) setCreatingUploadFolder(false);
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
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
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

          {uploadCat && (
            <p className="admin-upload-destination">
              → Uploading to <strong>{uploadCat}</strong>
              {resolvedUploadFolder && (
                <>
                  {" "}› folder <strong>{resolvedUploadFolder}</strong>
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
            Gallery ({images.length} photo{images.length !== 1 ? "s" : ""})
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

          {/* Folder rename section — visible when a specific category is selected */}
          {galleryFilter !== "All" &&
            foldersByCat[galleryFilter]?.length > 0 && (
              <div className="admin-folder-rename-section">
                <p className="admin-folder-rename-header">
                  <FolderPlus size={13} />
                  Folders in {galleryFilter} — click pencil to rename
                </p>
                <div className="admin-folder-rename-list">
                  {foldersByCat[galleryFilter].map((folder) => {
                    const isRenamingThis =
                      renamingFolder?.catName === galleryFilter &&
                      renamingFolder?.oldName  === folder;
                    const folderCount = images.filter(
                      (img) =>
                        img.category === galleryFilter && img.folder === folder
                    ).length;

                    return (
                      <div key={folder} className="admin-folder-rename-row">
                        {isRenamingThis ? (
                          <>
                            <input
                              className="admin-folder-rename-input"
                              value={renameFolderValue}
                              autoFocus
                              onChange={(e) => setRenameFolderValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  renameFolder(galleryFilter, folder, renameFolderValue);
                                if (e.key === "Escape")
                                  setRenamingFolder(null);
                              }}
                            />
                            <button
                              className="admin-icon-btn confirm"
                              onClick={() =>
                                renameFolder(galleryFilter, folder, renameFolderValue)
                              }
                            >
                              <Check size={13} />
                            </button>
                            <button
                              className="admin-icon-btn"
                              onClick={() => setRenamingFolder(null)}
                            >
                              <X size={13} />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="admin-folder-rename-name">
                              📁 {folder}
                            </span>
                            <span className="admin-folder-rename-count">
                              {folderCount} photo{folderCount !== 1 ? "s" : ""}
                            </span>
                            <button
                              className="admin-icon-btn"
                              onClick={() => {
                                setRenamingFolder({
                                  catName: galleryFilter,
                                  oldName: folder,
                                });
                                setRenameFolderValue(folder);
                              }}
                              title="Rename folder"
                            >
                              <Edit2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
                  onTitleChange={changeTitle}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
