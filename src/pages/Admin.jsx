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
  MessageSquare,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { auth, db, storage } from "../firebase/firebase";

const DEFAULT_CATEGORIES = [
  "Portraits",
  "Couples",
  "Events",
  "Proposals",
  "Graduation",
];

/* ----------------------------------------------------------
   Compress image before upload
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
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/* ----------------------------------------------------------
   Star picker for reviews
   ---------------------------------------------------------- */
function StarPicker({ value, onChange }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="star-picker">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`star-btn${n <= (hovered || value) ? " filled" : ""}`}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </div>
  );
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
      <div className="admin-image-card-img-wrap">
        <img src={image.imageUrl} alt={displayTitle} loading="lazy" />
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

      <div className="admin-image-card-compact">
        <p className="admin-image-card-title-text">{displayTitle}</p>
        <div className="admin-image-card-chips">
          <span className="admin-chip cat-chip">{image.category}</span>
          {image.folder && (
            <span className="admin-chip folder-chip">📁 {image.folder}</span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="admin-image-card-panel">
          <div className="admin-panel-field">
            <label>Caption</label>
            <div className="admin-panel-input-row">
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveTitle()}
                placeholder="Photo caption…"
              />
              <button className="admin-icon-btn confirm" onClick={saveTitle} title="Save">
                <Check size={13} />
              </button>
            </div>
          </div>

          <div className="admin-panel-field">
            <label>Category</label>
            <select
              value={image.category || ""}
              onChange={(e) => onCategoryChange(image, e.target.value)}
            >
              {allCategories.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="admin-panel-field">
            <label>Album</label>
            {creatingFolder ? (
              <div className="admin-folder-input-row">
                <input
                  className="admin-folder-input"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="New album name"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && confirmNewFolder()}
                />
                <button className="admin-folder-save-btn" onClick={confirmNewFolder}>Save</button>
                <button className="admin-folder-cancel-btn" onClick={() => { setCreatingFolder(false); setNewFolderName(""); }}>✕</button>
              </div>
            ) : (
              <select value={image.folder || ""} onChange={handleFolderSelect}>
                <option value="">No album</option>
                {foldersForCat.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
                <option value="__new__">+ Create new album…</option>
              </select>
            )}
          </div>

          <button className="admin-panel-close" onClick={() => setExpanded(false)}>
            <X size={12} /> Done editing
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
  // ── Firestore state ──────────────────────────────────────
  const [categories, setCategories] = useState([]);
  const [images,     setImages]     = useState([]);
  const [reviews,    setReviews]    = useState([]);

  // ── Upload state ─────────────────────────────────────────
  const [uploadCat,            setUploadCat]            = useState("");
  const [uploadFolder,         setUploadFolder]         = useState("");
  const [creatingUploadFolder, setCreatingUploadFolder] = useState(false);
  const [newUploadFolder,      setNewUploadFolder]      = useState("");
  const [caption,              setCaption]              = useState("");
  const [status,               setStatus]               = useState("");
  const [uploading,            setUploading]            = useState(false);
  const [dragOver,             setDragOver]             = useState(false);

  // ── New category inline (from upload form) ───────────────
  const [creatingCatInline, setCreatingCatInline] = useState(false);
  const [newCatInline,      setNewCatInline]      = useState("");

  // ── Gallery filter ───────────────────────────────────────
  const [galleryFilter, setGalleryFilter] = useState("All");

  // ── Category management ──────────────────────────────────
  const [newCatName,       setNewCatName]       = useState("");
  const [savingCat,        setSavingCat]        = useState(false);
  const [renamingCatId,    setRenamingCatId]    = useState(null);
  const [renameCatValue,   setRenameCatValue]   = useState("");
  const [editingDescCatId, setEditingDescCatId] = useState(null);
  const [descValue,        setDescValue]        = useState("");

  // ── Folder management ────────────────────────────────────
  const [renamingFolder,    setRenamingFolder]    = useState(null);
  const [renameFolderValue, setRenameFolderValue] = useState("");
  const [editingFolderDesc, setEditingFolderDesc] = useState(null);
  const [folderDescValue,   setFolderDescValue]   = useState("");

  // ── Reviews form ─────────────────────────────────────────
  const [newReviewName,   setNewReviewName]   = useState("");
  const [newReviewText,   setNewReviewText]   = useState("");
  const [newReviewRating, setNewReviewRating] = useState(5);
  const [addingReview,    setAddingReview]    = useState(false);

  /* ── Seed default categories on first load ─────────────── */
  useEffect(() => {
    async function seedMissing() {
      try {
        const snap = await getDocs(collection(db, "categories"));
        const existing = new Set(snap.docs.map((d) => d.data().name?.toLowerCase()));
        const missing = DEFAULT_CATEGORIES.filter((n) => !existing.has(n.toLowerCase()));
        const startOrder = snap.docs.length;
        for (let i = 0; i < missing.length; i++) {
          await addDoc(collection(db, "categories"), {
            name:      missing[i],
            visible:   true,
            order:     startOrder + i,
            createdAt: serverTimestamp(),
          });
        }
      } catch (e) {
        console.warn("Could not seed categories:", e);
      }
    }
    seedMissing();
  }, []);

  /* ── Listen: categories ────────────────────────────────── */
  useEffect(() => {
    const q = query(collection(db, "categories"), orderBy("order", "asc"));
    return onSnapshot(q, (snap) => {
      const cats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCategories(cats);
      setUploadCat((prev) => prev || cats[0]?.name || DEFAULT_CATEGORIES[0]);
    });
  }, []);

  /* ── Listen: images ────────────────────────────────────── */
  useEffect(() => {
    const q = query(collection(db, "gallery"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setImages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  /* ── Listen: reviews ───────────────────────────────────── */
  useEffect(() => {
    const q = query(collection(db, "reviews"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setReviews(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  /* ── Derived ───────────────────────────────────────────── */
  // Always have selectable categories — falls back to defaults while Firestore loads
  const displayCategories = categories.length > 0
    ? categories
    : DEFAULT_CATEGORIES.map((n, i) => ({ id: n, name: n, visible: true, order: i }));

  const categoryNames = displayCategories.map((c) => c.name);

  // Build folder list directly from images — keyed by whatever category
  // the images actually have, so it's never blocked by categoryNames loading order.
  const foldersByCat = useMemo(() => {
    const map = {};
    images.forEach((img) => {
      const folder = (img.folder || "").trim();
      if (!folder) return;
      if (!map[img.category]) map[img.category] = new Set();
      map[img.category].add(folder);
    });
    const result = {};
    Object.entries(map).forEach(([cat, set]) => {
      result[cat] = [...set].sort();
    });
    return result;
  }, [images]);

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

  const currentFolders       = foldersByCat[uploadCat] || [];
  const resolvedUploadFolder = creatingUploadFolder ? newUploadFolder : uploadFolder;

  /* ── Upload ────────────────────────────────────────────── */
  async function uploadFiles(files) {
    const selected = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (!selected.length) { setStatus("Please choose image files only."); return; }
    const folderToUse = creatingUploadFolder ? newUploadFolder.trim() : uploadFolder;
    setUploading(true);
    for (const file of selected) {
      try {
        setStatus(`Compressing ${file.name}…`);
        const compressed = await compressImage(file);
        const origMB = (file.size / 1024 / 1024).toFixed(1);
        const compMB = (compressed.size / 1024 / 1024).toFixed(1);
        setStatus(`Uploading ${file.name} (${origMB} MB → ${compMB} MB)…`);
        const safeName   = compressed.name.replace(/[^a-z0-9.-]/gi, "-").toLowerCase();
        const filePath   = `gallery/${Date.now()}-${safeName}`;
        const storRef    = ref(storage, filePath);
        const uploadTask = uploadBytesResumable(storRef, compressed);
        await new Promise((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snap) => {
              const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
              setStatus(`Uploading ${file.name} — ${pct}%`);
            },
            reject,
            resolve
          );
        });
        const imageUrl = await getDownloadURL(storRef);
        await addDoc(collection(db, "gallery"), {
          title:       caption || uploadCat,
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
    setCaption("");
    setCreatingUploadFolder(false);
    setNewUploadFolder("");
    setUploading(false);
  }

  /* ── Delete image ──────────────────────────────────────── */
  async function deleteImage(image) {
    if (!window.confirm("Delete this image from the website?")) return;
    try {
      await deleteDoc(doc(db, "gallery", image.id));
      if (image.storagePath) await deleteObject(ref(storage, image.storagePath));
    } catch { alert("Could not delete. Please try again."); }
  }

  /* ── Change category / folder / title ─────────────────── */
  async function changeCat(image, newCat) {
    try { await updateDoc(doc(db, "gallery", image.id), { category: newCat, folder: "" }); }
    catch { alert("Could not update category."); }
  }

  async function changeFolder(image, newFolder) {
    try { await updateDoc(doc(db, "gallery", image.id), { folder: newFolder }); }
    catch { alert("Could not update album."); }
  }

  async function changeTitle(image, newTitle) {
    try { await updateDoc(doc(db, "gallery", image.id), { title: newTitle || image.category }); }
    catch { alert("Could not update caption."); }
  }

  /* ── Category visibility / add / rename ───────────────── */
  async function toggleVisibility(cat) {
    try { await updateDoc(doc(db, "categories", cat.id), { visible: !cat.visible }); }
    catch { alert("Could not update visibility."); }
  }

  async function addCategory(name) {
    const n = (name || newCatName).trim();
    if (!n) return;
    if (categories.some((c) => c.name.toLowerCase() === n.toLowerCase())) {
      alert("A category with that name already exists."); return;
    }
    try {
      setSavingCat(true);
      await addDoc(collection(db, "categories"), {
        name: n, visible: true, order: categories.length, createdAt: serverTimestamp(),
      });
      if (!name) setNewCatName("");
      return n;
    } catch { alert("Could not add category."); }
    finally { setSavingCat(false); }
  }

  async function renameCategory(cat, newName) {
    newName = newName.trim();
    if (!newName || newName === cat.name) { setRenamingCatId(null); return; }
    if (categories.some((c) => c.id !== cat.id && c.name.toLowerCase() === newName.toLowerCase())) {
      alert("A category with that name already exists."); return;
    }
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "categories", cat.id), { name: newName });
      const q    = query(collection(db, "gallery"), where("category", "==", cat.name));
      const snap = await getDocs(q);
      snap.docs.forEach((d) => batch.update(d.ref, { category: newName }));
      await batch.commit();
      setRenamingCatId(null);
    } catch { alert("Could not rename category."); }
  }

  /* ── Category / folder descriptions ───────────────────── */
  async function saveCategoryDescription(cat, desc) {
    try { await updateDoc(doc(db, "categories", cat.id), { description: desc.trim() }); }
    catch { alert("Could not save description."); }
    setEditingDescCatId(null);
  }

  async function saveFolderDescription(catId, folderName, desc) {
    try {
      await updateDoc(doc(db, "categories", catId), {
        [`folderDescriptions.${folderName}`]: desc.trim(),
      });
    } catch { alert("Could not save album description."); }
    setEditingFolderDesc(null);
  }

  /* ── Rename folder ─────────────────────────────────────── */
  async function renameFolder(catName, oldFolder, newFolder) {
    newFolder = newFolder.trim();
    if (!newFolder || newFolder === oldFolder) { setRenamingFolder(null); return; }
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
    } catch { alert("Could not rename album."); }
  }

  /* ── Reviews ───────────────────────────────────────────── */
  async function addReview() {
    if (!newReviewName.trim() || !newReviewText.trim()) return;
    try {
      setAddingReview(true);
      await addDoc(collection(db, "reviews"), {
        name:      newReviewName.trim(),
        text:      newReviewText.trim(),
        rating:    newReviewRating,
        createdAt: serverTimestamp(),
      });
      setNewReviewName("");
      setNewReviewText("");
      setNewReviewRating(5);
    } catch { alert("Could not add review."); }
    finally { setAddingReview(false); }
  }

  async function deleteReview(review) {
    if (!window.confirm("Delete this review?")) return;
    try { await deleteDoc(doc(db, "reviews", review.id)); }
    catch { alert("Could not delete."); }
  }

  /* ── Add category inline from upload ───────────────────── */
  async function addCategoryFromUpload() {
    const n = newCatInline.trim();
    if (!n) return;
    const result = await addCategory(n);
    if (result || n) {
      setUploadCat(n);
      setCreatingCatInline(false);
      setNewCatInline("");
    }
  }

  /* ───────────────────────────────────────────────────────── */
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
            <a className="btn btn-secondary" href="#/">View Website</a>
            <button className="btn btn-primary" onClick={() => signOut(auth)}>Logout</button>
          </div>
        </div>

        {/* ── Categories panel ── */}
        <div className="admin-panel">
          <h2>Session categories</h2>
          <p>
            Toggle visibility to show/hide on your website. Click ✏️ to rename. Add a short
            description — it shows on your site below the section title.
          </p>

          <div className="admin-cat-list">
            {categories.map((cat) => {
              const count      = countByCat[cat.name] ?? 0;
              const isRenaming = renamingCatId === cat.id;
              const isEditDesc = editingDescCatId === cat.id;

              return (
                <div key={cat.id} className="admin-cat-row">
                  <div
                    className="admin-cat-dot"
                    style={{ background: cat.visible ? "var(--green)" : "var(--border)" }}
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
                        <button className="admin-icon-btn confirm" onClick={() => renameCategory(cat, renameCatValue)}><Check size={13} /></button>
                        <button className="admin-icon-btn" onClick={() => setRenamingCatId(null)}><X size={13} /></button>
                      </div>
                    ) : (
                      <>
                        <span className="admin-cat-name">{cat.name}</span>
                        <span className="admin-cat-count">
                          {count} photo{count !== 1 ? "s" : ""}
                          {count === 0 && <span className="admin-cat-hidden-note"> · hidden on website</span>}
                        </span>
                      </>
                    )}

                    {/* Description row */}
                    {!isRenaming && (
                      isEditDesc ? (
                        <div className="admin-cat-desc-edit">
                          <input
                            value={descValue}
                            onChange={(e) => setDescValue(e.target.value)}
                            placeholder="Short description (e.g. Autumn in DC)"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveCategoryDescription(cat, descValue);
                              if (e.key === "Escape") setEditingDescCatId(null);
                            }}
                          />
                          <button className="admin-icon-btn confirm" onClick={() => saveCategoryDescription(cat, descValue)}><Check size={13} /></button>
                          <button className="admin-icon-btn" onClick={() => setEditingDescCatId(null)}><X size={13} /></button>
                        </div>
                      ) : (
                        <button
                          className="admin-cat-desc-btn"
                          onClick={() => { setEditingDescCatId(cat.id); setDescValue(cat.description || ""); }}
                        >
                          {cat.description ? `"${cat.description}"` : "+ Add description…"}
                        </button>
                      )
                    )}
                  </div>

                  <div className="admin-cat-actions">
                    {!isRenaming && (
                      <button
                        className="admin-cat-rename-btn"
                        onClick={() => { setRenamingCatId(cat.id); setRenameCatValue(cat.name); }}
                        title="Rename"
                      >
                        <Edit2 size={13} />
                      </button>
                    )}
                    <button
                      className="admin-cat-toggle"
                      onClick={() => toggleVisibility(cat)}
                      title={cat.visible ? "Hide from website" : "Show on website"}
                    >
                      {cat.visible ? <Eye size={15} strokeWidth={1.75} /> : <EyeOff size={15} strokeWidth={1.75} />}
                      <span>{cat.visible ? "Visible" : "Hidden"}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

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
              onClick={() => addCategory()}
              disabled={savingCat || !newCatName.trim()}
            >
              <Plus size={15} /> Add
            </button>
          </div>
        </div>

        {/* ── Upload panel ── */}
        <div className="admin-panel">
          <h2>Add photos</h2>
          <p>Images are auto-compressed. Pick a category, then optionally choose an album and add a caption.</p>

          {/* Step 1: Category */}
          <div className="upload-step">
            <p className="upload-step-label">
              <span className="upload-step-num">1</span> Category
            </p>
            <div className="admin-upload-cat-chips">
              {displayCategories.map((cat) => (
                <button
                  key={cat.id}
                  className={`admin-cat-chip${uploadCat === cat.name ? " selected" : ""}`}
                  onClick={() => {
                    setUploadCat(cat.name);
                    setUploadFolder("");
                    setCreatingUploadFolder(false);
                    setNewUploadFolder("");
                    setCreatingCatInline(false);
                  }}
                >
                  {cat.name}
                </button>
              ))}
              {!creatingCatInline ? (
                <button
                  className="admin-cat-chip new-chip"
                  onClick={() => setCreatingCatInline(true)}
                >
                  <Plus size={13} /> New
                </button>
              ) : (
                <div className="admin-folder-input-row" style={{ marginTop: 8, width: "100%" }}>
                  <input
                    className="admin-folder-input"
                    value={newCatInline}
                    onChange={(e) => setNewCatInline(e.target.value)}
                    placeholder="Category name…"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && addCategoryFromUpload()}
                  />
                  <button className="admin-folder-save-btn" onClick={addCategoryFromUpload}>Add</button>
                  <button className="admin-folder-cancel-btn" onClick={() => { setCreatingCatInline(false); setNewCatInline(""); }}>✕</button>
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Album */}
          <div className="upload-step">
            <p className="upload-step-label">
              <span className="upload-step-num">2</span> Album
              <span className="upload-step-optional">optional</span>
            </p>
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
                <option value="">No album (general)</option>
                {currentFolders.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
                <option value="__new__">+ Create new album…</option>
              </select>
            ) : (
              <div className="admin-folder-input-row">
                <input
                  className="admin-folder-input"
                  value={newUploadFolder}
                  onChange={(e) => setNewUploadFolder(e.target.value)}
                  placeholder="Album name (e.g. Autumn in DC)"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newUploadFolder.trim())
                      setCreatingUploadFolder(false);
                  }}
                />
                <button className="admin-folder-save-btn" onClick={() => { if (newUploadFolder.trim()) setCreatingUploadFolder(false); }}>
                  Save
                </button>
                <button className="admin-folder-cancel-btn" onClick={() => { setCreatingUploadFolder(false); setNewUploadFolder(""); }}>
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Step 3: Caption */}
          <div className="upload-step">
            <p className="upload-step-label">
              <span className="upload-step-num">3</span> Caption
              <span className="upload-step-optional">optional</span>
            </p>
            <input
              className="admin-cat-add-input"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="e.g. Golden hour session at Lincoln Memorial"
            />
          </div>

          {/* Drop zone */}
          <label
            className={dragOver ? "drop-zone drag-active" : "drop-zone"}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files); }}
          >
            <UploadCloud size={40} strokeWidth={1.25} />
            <strong>Drop photos here</strong>
            <span>or tap to choose files</span>
            <input type="file" accept="image/*" multiple onChange={(e) => uploadFiles(e.target.files)} />
          </label>

          {uploadCat && (
            <p className="admin-upload-destination">
              → <strong>{uploadCat}</strong>
              {resolvedUploadFolder && <> › <strong>{resolvedUploadFolder}</strong></>}
              {caption && <> · "{caption}"</>}
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
          <h2>Gallery ({images.length} photo{images.length !== 1 ? "s" : ""})</h2>

          <div className="admin-gallery-filters">
            {["All", ...categoryNames].map((cat) => (
              <button
                key={cat}
                className={`admin-gallery-filter-btn${galleryFilter === cat ? " active" : ""}`}
                onClick={() => setGalleryFilter(cat)}
              >
                {cat}
                <span className="admin-filter-count">{countByCat[cat] ?? 0}</span>
              </button>
            ))}
          </div>

          {/* Album management — shown when filtering by category */}
          {galleryFilter !== "All" && foldersByCat[galleryFilter]?.length > 0 && (
            <div className="admin-folder-rename-section">
              <p className="admin-folder-rename-header">
                Albums in {galleryFilter} — rename or add a description
              </p>
              <div className="admin-folder-rename-list">
                {foldersByCat[galleryFilter].map((folder) => {
                  const catObj        = categories.find((c) => c.name === galleryFilter);
                  const isRenamingThis = renamingFolder?.catName === galleryFilter && renamingFolder?.oldName === folder;
                  const isEditingDesc  = editingFolderDesc?.catId === catObj?.id && editingFolderDesc?.folderName === folder;
                  const existingDesc   = catObj?.folderDescriptions?.[folder] || "";
                  const folderCount    = images.filter((img) => img.category === galleryFilter && img.folder === folder).length;

                  return (
                    <div key={folder} className="admin-folder-rename-row-wrap">
                      <div className="admin-folder-rename-row">
                        {isRenamingThis ? (
                          <>
                            <input
                              className="admin-folder-rename-input"
                              value={renameFolderValue}
                              autoFocus
                              onChange={(e) => setRenameFolderValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") renameFolder(galleryFilter, folder, renameFolderValue);
                                if (e.key === "Escape") setRenamingFolder(null);
                              }}
                            />
                            <button className="admin-icon-btn confirm" onClick={() => renameFolder(galleryFilter, folder, renameFolderValue)}><Check size={13} /></button>
                            <button className="admin-icon-btn" onClick={() => setRenamingFolder(null)}><X size={13} /></button>
                          </>
                        ) : (
                          <>
                            <span className="admin-folder-rename-name">📁 {folder}</span>
                            <span className="admin-folder-rename-count">{folderCount} photo{folderCount !== 1 ? "s" : ""}</span>
                            <button
                              className="admin-icon-btn"
                              onClick={() => { setRenamingFolder({ catName: galleryFilter, oldName: folder }); setRenameFolderValue(folder); }}
                              title="Rename album"
                            >
                              <Edit2 size={13} />
                            </button>
                          </>
                        )}
                      </div>

                      {/* Album description */}
                      {catObj && (
                        isEditingDesc ? (
                          <div className="admin-cat-desc-edit" style={{ marginTop: 6 }}>
                            <input
                              value={folderDescValue}
                              onChange={(e) => setFolderDescValue(e.target.value)}
                              placeholder="Album description (shows on website)…"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveFolderDescription(catObj.id, folder, folderDescValue);
                                if (e.key === "Escape") setEditingFolderDesc(null);
                              }}
                            />
                            <button className="admin-icon-btn confirm" onClick={() => saveFolderDescription(catObj.id, folder, folderDescValue)}><Check size={13} /></button>
                            <button className="admin-icon-btn" onClick={() => setEditingFolderDesc(null)}><X size={13} /></button>
                          </div>
                        ) : (
                          <button
                            className="admin-cat-desc-btn"
                            style={{ marginTop: 5, marginLeft: 4 }}
                            onClick={() => { setEditingFolderDesc({ catId: catObj.id, folderName: folder }); setFolderDescValue(existingDesc); }}
                          >
                            {existingDesc ? `"${existingDesc}"` : "+ Add album description…"}
                          </button>
                        )
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
                  allCategories={categories.length > 0 ? categories : displayCategories}
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

        {/* ── Client Reviews ── */}
        <div className="admin-panel">
          <div className="admin-reviews-header">
            <div>
              <h2>Client Reviews</h2>
              <p>Add testimonials from happy clients — they show on your public website.</p>
            </div>
            <MessageSquare size={22} strokeWidth={1.5} color="var(--gray)" />
          </div>

          {/* Existing reviews */}
          {reviews.length > 0 && (
            <div className="admin-reviews-list">
              {reviews.map((r) => (
                <div key={r.id} className="admin-review-row">
                  <div className="admin-review-stars">
                    {"★".repeat(r.rating || 5)}{"☆".repeat(5 - (r.rating || 5))}
                  </div>
                  <p className="admin-review-text">"{r.text}"</p>
                  <p className="admin-review-name">— {r.name}</p>
                  <button
                    className="admin-review-delete"
                    onClick={() => deleteReview(r)}
                    title="Delete review"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add review form */}
          <div className="admin-add-review-form">
            <p className="upload-step-label" style={{ marginBottom: 12 }}>
              <span className="upload-step-num">+</span> Add a review
            </p>

            <div className="admin-fields" style={{ marginBottom: 12 }}>
              <label>
                Client name
                <input
                  value={newReviewName}
                  onChange={(e) => setNewReviewName(e.target.value)}
                  placeholder="e.g. Sarah M."
                />
              </label>
              <label>
                Rating
                <StarPicker value={newReviewRating} onChange={setNewReviewRating} />
              </label>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              <label style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--gray)" }}>Review text</label>
              <textarea
                className="admin-review-textarea"
                value={newReviewText}
                onChange={(e) => setNewReviewText(e.target.value)}
                placeholder="What did they say about your work?"
                rows={3}
              />
            </div>

            <button
              className="btn btn-primary"
              onClick={addReview}
              disabled={addingReview || !newReviewName.trim() || !newReviewText.trim()}
            >
              <Plus size={15} /> Add Review
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
