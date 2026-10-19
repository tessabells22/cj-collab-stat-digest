/* App shell: fills the sidebar and top bar, owns the theme toggle, the avatar menu and the
   sign-in screen. Load it right before the page's own script so the elements it creates
   (#signout, #gate, #gateDomain, #gateErr) exist when the page wires them up.
   <body data-page="digest" data-crumb="My collabs" data-auth="public|required"> */
(function () {
  const store = { get(k) { try { return localStorage.getItem(k) } catch (e) { return null } }, set(k, v) { try { localStorage.setItem(k, v) } catch (e) {} } };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICON = {
    home: svg('<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.1 2.1 0 0 0-2.9-.1z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>'),
    digest: svg('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
    kpi: svg('<path d="M3 3v18h18"/><path d="M7 15v2M11 11v6M15 7v10M19 12v5"/>'),
    guide: svg('<path d="M4 19.5V5a2 2 0 0 1 2-2h14v18H6.5A2.5 2.5 0 0 1 4 18.5z"/><path d="M8 7h8M8 11h6"/>'),
    moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    chev: svg('<path d="m15 18-6-6 6-6"/>'),
    menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    google: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>',
  };
  const NAV = [
    { id: "home", href: "/", label: "Home" },
    { id: "digest", href: "/digest", label: "My collabs" },
    { id: "kpi", href: "/kpi", label: "Weekly KPIs" },
    { id: "guide", href: "/guide", label: "Guide" },
  ];
  const body = document.body, page = body.dataset.page, app = document.getElementById("app");

  /* theme */
  function setMode(m) {
    document.documentElement.dataset.mode = m;
    store.set("cd.mode", m);
    const b = document.getElementById("themeBtn");
    if (b) { b.innerHTML = m === "dark" ? ICON.moon : ICON.sun; b.setAttribute("aria-label", m === "dark" ? "Switch to light mode" : "Switch to dark mode"); }
  }

  /* sidebar */
  const side = app.querySelector(".side");
  side.innerHTML = `
    <div class="side-head">
      <a class="wordmark" href="/" aria-label="Collab Digest home"><span class="mono">CD</span><b>Collab Digest<i></i></b><small>CFS tools · ContentJet</small></a>
      <button type="button" class="side-btn collapse" id="collapseBtn" aria-label="Collapse sidebar">${ICON.chev}</button>
    </div>
    <nav class="nav" aria-label="Main">${NAV.map(n => `<a href="${n.href}"${n.id === page ? ' aria-current="page"' : ""} title="${esc(n.label)}">${ICON[n.id]}<span>${esc(n.label)}</span></a>`).join("")}</nav>
    <p class="side-foot">Read-only. Reads the Monday.com Production board and never changes it.</p>`;
  if (!app.querySelector(".scrim")) app.insertAdjacentHTML("beforeend", '<div class="scrim" id="scrim"></div>');
  if (store.get("cd.side") === "collapsed") app.classList.add("collapsed");
  document.getElementById("collapseBtn").onclick = () => {
    const c = app.classList.toggle("collapsed");
    store.set("cd.side", c ? "collapsed" : "open");
    document.getElementById("collapseBtn").setAttribute("aria-label", c ? "Expand sidebar" : "Collapse sidebar");
  };

  /* top bar */
  const top = app.querySelector(".topbar");
  top.innerHTML = `
    <div class="top-left"><button type="button" class="iconbtn burger" id="burger" aria-label="Open menu">${ICON.menu}</button><span class="crumb">${esc(body.dataset.crumb || "")}</span></div>
    <div class="top-actions">
      <button type="button" class="iconbtn" id="themeBtn"></button>
      <a class="signin-link" id="signinLink" href="/api/auth/login" hidden>Sign in</a>
      <button type="button" class="avatar" id="avatarBtn" aria-haspopup="true" aria-expanded="false" hidden></button>
      <div class="usermenu" id="userMenu" hidden><div><div class="who-name" id="whoName"></div><div class="who-mail" id="whoMail"></div></div><button type="button" id="signout">Sign out</button></div>
    </div>`;
  setMode(store.get("cd.mode") || "dark");
  document.getElementById("themeBtn").onclick = () => setMode(document.documentElement.dataset.mode === "dark" ? "light" : "dark");
  const burger = document.getElementById("burger"), scrim = document.getElementById("scrim");
  burger.onclick = () => app.classList.add("nav-open");
  scrim.onclick = () => app.classList.remove("nav-open");
  const avatarBtn = document.getElementById("avatarBtn"), menu = document.getElementById("userMenu");
  avatarBtn.onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; avatarBtn.setAttribute("aria-expanded", String(!menu.hidden)); };
  document.addEventListener("click", e => { if (!menu.hidden && !menu.contains(e.target)) { menu.hidden = true; avatarBtn.setAttribute("aria-expanded", "false"); } });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { menu.hidden = true; app.classList.remove("nav-open"); } });
  /* default sign-out; a page may replace this handler with its own */
  document.getElementById("signout").onclick = async () => {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); } catch (e) {}
    location.href = "/";
  };

  /* sign-in screen */
  if (!document.getElementById("gate")) {
    body.insertAdjacentHTML("afterbegin", `<div class="gate" id="gate" hidden>
      <div class="brand"><span class="bolt"><svg viewBox="0 0 24 24" fill="#fff"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg></span>ContentJet · CFS Tools</div>
      <div class="gate-card"><h1>Sign in to Collab Digest</h1><p>Use your <b id="gateDomain">company</b> Google account.</p>
        <a class="gbtn" href="/api/auth/login">${ICON.google}Continue with Google</a></div>
      <div class="note err" id="gateErr" hidden></div>
      <p class="gate-foot">Internal ContentJet tool. Access is limited to company Google Workspace accounts.</p></div>`);
  }

  /* who is signed in: fills the avatar; public pages show themselves straight away */
  const initials = s => String(s || "").split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";
  window.Shell = {
    config: fetch("/api/config", { credentials: "same-origin" }).then(r => r.json()).catch(() => ({})),
    setUser(user) {
      document.getElementById("signinLink").hidden = !!user;
      avatarBtn.hidden = !user;
      if (!user) { menu.hidden = true; return; }
      avatarBtn.textContent = initials(user.name || user.email);
      avatarBtn.setAttribute("aria-label", "Account: " + (user.name || user.email));
      document.getElementById("whoName").textContent = user.name || "";
      document.getElementById("whoMail").textContent = user.email || "";
    },
  };
  window.Shell.config.then(cfg => {
    window.Shell.setUser(cfg.signedIn ? cfg.user : null);
    if (cfg.domain) document.getElementById("gateDomain").textContent = "@" + cfg.domain;
    if (body.dataset.auth === "public") app.hidden = false;
  });
})();
