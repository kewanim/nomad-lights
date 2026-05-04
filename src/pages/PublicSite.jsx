import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { Camera, Menu, X } from "lucide-react";
import { db } from "../firebase/firebase";

/* ----------------------------------------------------------
   Fallback images — only shown AFTER loading completes and
   the gallery is genuinely empty. Never shown during loading.
   ---------------------------------------------------------- */
const FALLBACK = {
  Portraits: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80",
  Couples:   "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=800&q=80",
  Events:    "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=800&q=80",
  Proposals: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80",
  Graduation:"https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=800&q=80",
};
const GENERIC_FALLBACK =
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80";

const DEFAULT_CATS = ["Portraits","Couples","Events","Proposals","Graduation"].map(
  (name, i) => ({ id: name, name, visible: true, order: i })
);

/* ----------------------------------------------------------
   CategoryCard
   Cycles through ALL photos in that category with crossfade.
   Before loading finishes: shows nothing (no placeholder flash).
   ---------------------------------------------------------- */
function CategoryCard({ category, images, loading }) {
  const [activeIdx, setActiveIdx] = useState(0);

  // Only use real images — no Unsplash fallback while loading
  const slides = images.length > 0
    ? images
    : [{ id: "fb", imageUrl: FALLBACK[category.name] || GENERIC_FALLBACK }];

  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(
      () => setActiveIdx((i) => (i + 1) % slides.length),
      2500
    );
    return () => clearInterval(t);
  }, [slides.length]);

  const sectionId = `cat-${category.name.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <a href={`#${sectionId}`} className="category-card" aria-label={`View ${category.name} photos`}>
      <div className="category-card-img-stack">
        {loading ? (
          /* Skeleton — no placeholder image flash */
          <div className="skeleton" style={{ position: "absolute", inset: 0 }} />
        ) : (
          slides.map((img, i) => (
            <img
              key={img.id}
              src={img.imageUrl}
              alt={`${category.name} ${i + 1}`}
              className={`category-card-img${i === activeIdx ? " active" : ""}`}
              loading={i === 0 ? "eager" : "lazy"}
            />
          ))
        )}
      </div>
      <div className="category-card-overlay">
        <p className="category-card-name">{category.name}</p>
        {!loading && images.length > 0 && (
          <p className="category-card-count">
            {images.length} {images.length === 1 ? "photo" : "photos"}
          </p>
        )}
      </div>
    </a>
  );
}

/* ----------------------------------------------------------
   AutoScrollCarousel
   Continuous cinematic ticker. Duplicates slides for seamless
   loop. Pauses on hover/touch so visitors can look closer.
   ---------------------------------------------------------- */
function AutoScrollCarousel({ images, loading, speed = 0.45 }) {
  const trackRef   = useRef(null);
  const pausedRef  = useRef(false);
  const rafRef     = useRef(null);

  const shouldAnimate = !loading && images.length >= 2;
  // Duplicate for seamless infinite loop
  const slides = shouldAnimate ? [...images, ...images] : images;

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !shouldAnimate) return;

    let halfWidth = 0;
    let pos       = 0;

    function step() {
      // Measure on first frame (DOM is ready by then)
      if (!halfWidth) halfWidth = track.scrollWidth / 2;

      if (!pausedRef.current && halfWidth > 0) {
        pos += speed;
        if (pos >= halfWidth) pos -= halfWidth;
        track.style.transform = `translateX(-${pos}px)`;
      }
      rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [shouldAnimate, speed, images]);

  return (
    <div
      className="auto-carousel-outer"
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
      onTouchStart={() => { pausedRef.current = true; }}
      onTouchEnd={() => { setTimeout(() => { pausedRef.current = false; }, 1200); }}
    >
      <div className="auto-carousel-track" ref={trackRef}>
        {loading
          ? [1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton skeleton-slide" />
            ))
          : slides.map((img, i) => {
              // Show folder name as label, or custom title if it differs from category
              const label = img.folder
                ? img.folder
                : img.title && img.title !== img.category
                  ? img.title
                  : null;
              return (
                <div key={`${img.id}-${i}`} className="carousel-slide">
                  <img
                    src={img.imageUrl}
                    alt={img.title || img.category}
                    loading="lazy"
                  />
                  {label && (
                    <div className="carousel-slide-info">
                      <p className="carousel-slide-title">{label}</p>
                    </div>
                  )}
                </div>
              );
            })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------
   FolderSection — a named sub-section within a category
   ---------------------------------------------------------- */
function FolderSection({ folderName, images }) {
  return (
    <div className="folder-section">
      <div className="container">
        <div className="folder-section-header">
          <span className="folder-section-title">{folderName}</span>
          <span className="folder-section-count">
            {images.length} {images.length === 1 ? "photo" : "photos"}
          </span>
        </div>
      </div>
      <AutoScrollCarousel images={images} loading={false} />
    </div>
  );
}

/* ----------------------------------------------------------
   CategorySection — one full section per category.
   If folders exist: renders a FolderSection per folder.
   Otherwise: renders a single AutoScrollCarousel.
   ---------------------------------------------------------- */
function CategorySection({ category, images, loading }) {
  const { hasFolders, folderGroups, unfiledImages } = useMemo(() => {
    const filed   = images.filter((img) => img.folder && img.folder.trim());
    const unfiled = images.filter((img) => !img.folder || !img.folder.trim());
    if (filed.length === 0)
      return { hasFolders: false, folderGroups: [], unfiledImages: images };

    const map = {};
    filed.forEach((img) => {
      const k = img.folder.trim();
      if (!map[k]) map[k] = [];
      map[k].push(img);
    });

    return {
      hasFolders:   true,
      folderGroups: Object.entries(map).map(([name, imgs]) => ({ name, images: imgs })),
      unfiledImages: unfiled,
    };
  }, [images]);

  // Fallback shown ONLY after loading & genuinely empty — no placeholder flash
  const fallbackImg = {
    id:       `fb-${category.name}`,
    title:    `${category.name} Session`,
    category: category.name,
    imageUrl: FALLBACK[category.name] || GENERIC_FALLBACK,
  };
  const displayImages =
    !loading && images.length === 0 ? [fallbackImg] : images;

  const sectionId = `cat-${category.name.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <section id={sectionId} className="portfolio-section">
      <div className="container">
        <div className="portfolio-header">
          <div>
            <p className="portfolio-cat-label">Session type</p>
            <h2 className="portfolio-cat-title">{category.name}</h2>
          </div>
        </div>
      </div>

      {hasFolders ? (
        <div className="folder-sections">
          {folderGroups.map((fg) => (
            <FolderSection key={fg.name} folderName={fg.name} images={fg.images} />
          ))}
          {unfiledImages.length > 0 && (
            <FolderSection folderName="General" images={unfiledImages} />
          )}
        </div>
      ) : (
        <AutoScrollCarousel images={displayImages} loading={loading} />
      )}
    </section>
  );
}

/* ----------------------------------------------------------
   Main public site
   ---------------------------------------------------------- */
export default function PublicSite() {
  const [categories, setCategories] = useState([]);
  const [allImages, setAllImages]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [menuOpen, setMenuOpen]     = useState(false);

  useEffect(() => {
    const q = query(collection(db, "categories"), orderBy("order", "asc"));
    return onSnapshot(q, (snap) => {
      setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, "gallery"), orderBy("createdAt", "desc"));
    return onSnapshot(
      q,
      (snap) => {
        setAllImages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, []);

  const activeCategories = useMemo(() => {
    const list = categories.length > 0 ? categories : DEFAULT_CATS;
    return list.filter((c) => c.visible);
  }, [categories]);

  const byCategory = useMemo(() => {
    const map = {};
    activeCategories.forEach((cat) => {
      map[cat.name] = allImages.filter((img) => img.category === cat.name);
    });
    return map;
  }, [activeCategories, allImages]);

  // Hero: most recent real photo. Null while loading (no flash).
  const heroImage = loading ? null : (allImages[0]?.imageUrl || null);

  // About: second real photo, or fallback after load
  const aboutImage = loading
    ? null
    : (allImages[1]?.imageUrl || FALLBACK.Couples || GENERIC_FALLBACK);

  function closeMenu() { setMenuOpen(false); }

  return (
    <div>
      {/* ── Header ── */}
      <header className="site-header">
        <div className="header-inner">
          <a href="#/" className="logo">
            <Camera size={17} strokeWidth={1.75} />
            Nomad Lights
          </a>
          <nav className="nav">
            <a href="#portfolio">Portfolio</a>
            <a href="#services">Services</a>
            <a href="#about">About</a>
            <a href="#contact" className="nav-cta">Book a Session</a>
          </nav>
          <button
            className="mobile-menu-btn"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Open menu"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* ── Mobile nav ── */}
      <div className={`mobile-nav${menuOpen ? " open" : ""}`} aria-hidden={!menuOpen}>
        <button className="mobile-nav-close" onClick={closeMenu} aria-label="Close">
          <X size={22} />
        </button>
        <a href="#portfolio" onClick={closeMenu}>Portfolio</a>
        <a href="#services"  onClick={closeMenu}>Services</a>
        <a href="#about"     onClick={closeMenu}>About</a>
        <a href="#contact"   onClick={closeMenu} className="btn btn-primary">
          Book a Session
        </a>
      </div>

      <main>
        {/* ── Hero ── */}
        <section className="hero">
          <div className="container">
            <p className="hero-eyebrow">DMV Photography</p>
            <h1>Photography<br />that moves you.</h1>
            <p className="hero-sub">
              Portraits, couples, events, proposals, and graduation sessions —
              captured with a clean, timeless style.
            </p>
            <div className="hero-actions">
              <a href="#contact"   className="btn btn-primary">Book a Session</a>
              <a href="#portfolio" className="btn btn-secondary">View Portfolio</a>
            </div>
          </div>

          <div className="container">
            <div className="hero-image-wrap">
              {loading ? (
                <div className="skeleton hero-img-skeleton" />
              ) : heroImage ? (
                <img src={heroImage} alt="Nomad Lights featured work" loading="eager" />
              ) : (
                /* No photos yet — neutral placeholder, no Unsplash flash */
                <div style={{
                  width: "100%", height: "100%",
                  background: "var(--light)",
                  borderRadius: "var(--radius-lg)",
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  <Camera size={40} strokeWidth={1} color="var(--border)" />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Category overview ── */}
        {activeCategories.length > 0 && (
          <section id="portfolio" className="category-overview">
            <div className="container">
              <p className="section-label">Browse sessions</p>
              <h2 className="section-title">
                Every moment,<br />
                <span>a different story.</span>
              </h2>
            </div>

            <div className="category-cards-row">
              {activeCategories.map((cat) => (
                <CategoryCard
                  key={cat.id}
                  category={cat}
                  images={byCategory[cat.name] || []}
                  loading={loading}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Portfolio sections ── */}
        <div className="portfolio-sections">
          {activeCategories.map((cat) => (
            <CategorySection
              key={cat.id}
              category={cat}
              images={byCategory[cat.name] || []}
              loading={loading}
            />
          ))}
        </div>

        {/* ── Services ── */}
        <section id="services" className="services-section">
          <div className="container">
            <p className="section-label">What I offer</p>
            <h2 className="section-title">
              Sessions for<br /><span>every moment.</span>
            </h2>
            <div className="services-grid">
              {[
                { name: "Portraits",   desc: "Individual or family portraits with a clean, modern look — styled around your personality and chosen location." },
                { name: "Couples",     desc: "Romantic, genuine sessions for couples. Engagement shoots, anniversaries, or just because." },
                { name: "Events",      desc: "Full event coverage — corporate, social, or personal. Every key moment documented beautifully." },
                { name: "Proposals",   desc: "Secretly captured, beautifully remembered. Let the biggest question of your life be a perfect surprise." },
                { name: "Graduation",  desc: "Mark the milestone with photos that honor the hard work and celebrate the moment." },
              ].map((s, i) => (
                <article key={s.name} className="service-card">
                  <p className="service-num">{String(i + 1).padStart(2, "0")}</p>
                  <h3>{s.name}</h3>
                  <p>{s.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── About ── */}
        <section id="about" className="about-section">
          <div className="container">
            <div className="about-inner">
              <div className="about-copy">
                <p className="section-label">About Nomad Lights</p>
                <h2 className="section-title" style={{ marginBottom: 0 }}>
                  Minimal. Warm.<br /><span>Real.</span>
                </h2>
                <p>
                  Nomad Lights is built for clients who want photos that feel
                  honest — not staged. The style is bright, clean, and focused
                  on real emotion and genuine connection.
                </p>
                <p>
                  Based in the DMV area, available for portrait, couples, event,
                  proposal, and graduation sessions wherever the moment takes us.
                </p>
              </div>
              <div className="about-img">
                {loading ? (
                  <div className="skeleton" style={{ width: "100%", height: "100%" }} />
                ) : aboutImage ? (
                  <img src={aboutImage} alt="Nomad Lights photography style" loading="lazy" />
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {/* ── Contact ── */}
        <section id="contact" className="contact-section">
          <div className="container">
            <p className="section-label">Let's connect</p>
            <h2 className="section-title">
              Ready to book<br /><span>your session?</span>
            </h2>

            {/* Contact details */}
            <div className="contact-details-row">
              <div className="contact-detail-item">
                <span className="contact-detail-label">Location</span>
                <span className="contact-detail-value">DC · MD · VA</span>
              </div>
              <div className="contact-detail-divider" />
              <div className="contact-detail-item">
                <span className="contact-detail-label">Email</span>
                <a href="mailto:kewanim40@gmail.com" className="contact-detail-value contact-detail-link">
                  kewanim40@gmail.com
                </a>
              </div>
              <div className="contact-detail-divider" />
              <div className="contact-detail-item">
                <span className="contact-detail-label">Phone</span>
                <a href="tel:2406885656" className="contact-detail-value contact-detail-link">
                  (240) 688-5656
                </a>
              </div>
            </div>

            {/* Buttons */}
            <div className="contact-actions">
              <a href="mailto:kewanim40@gmail.com" className="btn btn-white">Send an Email</a>
              <a href="tel:2406885656"             className="btn btn-outline">Call or Text</a>
            </div>

            {/* Instagram + QR */}
            <div className="contact-instagram-block">
              <a
                href="https://www.instagram.com/nomad_lights_?igsh=MWg0YnY4dHF0NTE5eg%3D%3D&utm_source=qr"
                target="_blank"
                rel="noreferrer"
                className="contact-instagram-link"
              >
                <div className="contact-qr-wrap">
                  <img
                    src="/insta-qr.png"
                    alt="Scan to open @nomad_lights_ on Instagram"
                    className="contact-qr-img"
                    onError={(e) => {
                      e.currentTarget.closest(".contact-qr-wrap").style.display = "none";
                    }}
                  />
                </div>
                <div className="contact-instagram-text">
                  <span className="contact-instagram-handle">@nomad_lights_</span>
                  <span className="contact-instagram-sub">Scan or tap to follow on Instagram</span>
                </div>
              </a>
            </div>

            <a href="#/admin" className="admin-link-small">Owner login</a>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="site-footer">
        <div className="container">
          <div className="footer-inner">
            <span>© {new Date().getFullYear()} Nomad Lights. All rights reserved.</span>
            <span>DC · MD · VA</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
