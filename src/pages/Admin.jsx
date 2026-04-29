import React, { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
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
import { UploadCloud, Trash2 } from "lucide-react";
import { auth, db, storage } from "../firebase/firebase";

const categories = ["Portraits", "Couples", "Events", "Proposals", "Graduation"];

export default function Admin({ user }) {
  const [images, setImages] = useState([]);
  const [category, setCategory] = useState("Portraits");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("");
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const galleryQuery = query(collection(db, "gallery"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(galleryQuery, (snapshot) => {
      const uploadedImages = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));

      setImages(uploadedImages);
    });

    return unsubscribe;
  }, []);

  async function uploadFiles(files) {
    const selectedFiles = Array.from(files || []).filter((file) =>
      file.type.startsWith("image/")
    );

    if (!selectedFiles.length) {
      setStatus("Please choose image files only.");
      return;
    }

    for (const file of selectedFiles) {
      try {
        setStatus(`Uploading ${file.name}...`);

        const safeName = file.name.replace(/[^a-z0-9.-]/gi, "-").toLowerCase();
        const filePath = `gallery/${Date.now()}-${safeName}`;
        const storageRef = ref(storage, filePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        await new Promise((resolve, reject) => {
          uploadTask.on("state_changed", null, reject, resolve);
        });

        const imageUrl = await getDownloadURL(storageRef);

        await addDoc(collection(db, "gallery"), {
          title: title || category,
          category,
          imageUrl,
          storagePath: filePath,
          createdAt: serverTimestamp(),
          createdBy: user.email,
        });

        setStatus(`Uploaded ${file.name}`);
      } catch (error) {
        setStatus(`Upload failed for ${file.name}`);
      }
    }

    setTitle("");
  }

  async function deleteImage(image) {
    const confirmed = window.confirm("Delete this image from the website?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "gallery", image.id));

      if (image.storagePath) {
        await deleteObject(ref(storage, image.storagePath));
      }
    } catch (error) {
      alert("Could not delete image. Try again.");
    }
  }

  async function changeImageCategory(image, newCategory) {
    try {
      await updateDoc(doc(db, "gallery", image.id), {
        category: newCategory,
      });
    } catch (error) {
      alert("Could not update category. Try again.");
    }
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Private dashboard</p>
          <h1>Nomad Lights Admin</h1>
          <p>
            Upload photos here. Public visitors only see the portfolio and cannot edit anything.
          </p>
        </div>

        <div className="admin-actions">
          <a className="button secondary" href="#/">
            View Website
          </a>
          <button className="button primary" onClick={() => signOut(auth)}>
            Logout
          </button>
        </div>
      </header>

      <section className="admin-panel">
        <h2>Add photos</h2>
        <p>Drag and drop photos below, or tap to choose files from your phone or computer.</p>

        <div className="admin-fields">
          <label>
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label>
            Optional title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Example: Downtown couples session"
            />
          </label>
        </div>

        <label
          className={dragOver ? "drop-zone active" : "drop-zone"}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            uploadFiles(event.dataTransfer.files);
          }}
        >
          <UploadCloud size={42} />
          <strong>Drop images here</strong>
          <span>or tap to upload</span>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => uploadFiles(event.target.files)}
          />
        </label>

        {status && <p className="status-message">{status}</p>}
      </section>

      <section className="admin-gallery">
        <h2>Current gallery</h2>

        {images.length === 0 ? (
          <p>No uploaded images yet.</p>
        ) : (
          <div className="admin-image-grid">
            {images.map((image) => (
              <article key={image.id} className="admin-image-card">
                <img src={image.imageUrl} alt={image.title || image.category} />

                <div>
                  <span>{image.category}</span>
                  <strong>{image.title || "Untitled"}</strong>

                  <label className="admin-category-edit">
                    Change category
                    <select
                      value={image.category || "Portraits"}
                      onChange={(event) => changeImageCategory(image, event.target.value)}
                    >
                      {categories.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button onClick={() => deleteImage(image)}>
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
