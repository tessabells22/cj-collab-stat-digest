/* App shell: fills the sidebar and top bar, owns the theme toggle, the avatar menu and the
   sign-in screen. Load it right before the page's own script so the elements it creates
   (#signout, #gate, #gateDomain, #gateErr) exist when the page wires them up. Also owns the
   "Connect your Monday.com" screen, shown over any page but the guide until the person pastes
   their own Monday token.
   <body data-page="digest" data-crumb="My collabs" data-auth="public|required"> */
(function () {
  const store = { get(k) { try { return localStorage.getItem(k) } catch (e) { return null } }, set(k, v) { try { localStorage.setItem(k, v) } catch (e) {} } };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICON = {
    home: svg('<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.1 2.1 0 0 0-2.9-.1z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>'),
    digest: svg('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
    kpi: svg('<path d="M3 3v18h18"/><path d="M7 15v2M11 11v6M15 7v10M19 12v5"/>'),
    creators: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 20a6.5 6.5 0 0 0-3-5.5"/>'),
    messages: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.7A8 8 0 1 1 21 12z"/><path d="M8.5 10.5h7M8.5 13.5h4.5"/>'),
    post: svg('<path d="M12 17v5"/><path d="M9 3h6l-1 6 4 4v2H6v-2l4-4z"/>'),
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
    { id: "creators", href: "/creators", label: "Creators" },
    { id: "messages", href: "/messages", label: "Messages" },
    { id: "post", href: "/post", label: "Post update" },
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
    <p class="side-foot">Reads the Monday.com Production board. The only change it makes is an update you post from Post update.</p>`;
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
      <div class="usermenu" id="userMenu" hidden><div><div class="who-name" id="whoName"></div><div class="who-mail" id="whoMail"></div><div class="who-mail" id="whoMonday"></div></div><button type="button" id="mondayBtn">Change Monday.com token</button><button type="button" id="signout">Sign out</button></div>
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

  /* connect Monday.com: each person reads the board with their own personal API token */
  body.insertAdjacentHTML("beforeend", `<div class="gate connect" id="connect" role="dialog" aria-modal="true" aria-labelledby="connectTitle" hidden>
    <div class="brand"><span class="bolt"><svg viewBox="0 0 24 24" fill="#fff"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg></span>ContentJet · CFS Tools</div>
    <form class="gate-card" id="connectForm" autocomplete="off">
      <h1 id="connectTitle">Connect your Monday.com</h1>
      <p>Collab Digest reads the Production board with your own Monday.com token, so you see the collabs you can see in Monday.</p>
      <ol class="connect-steps">
        <li>In Monday.com, click your avatar in the top right, then <b>Developers</b>.</li>
        <li>In the left pane, click <b>API token</b>, then copy the token.</li>
        <li>Paste it here.</li>
      </ol>
      <label class="sr" for="connectToken">Monday.com API token</label>
      <p class="connect-warn"><b>Keep your token private.</b> It can see everything you can see in Monday.com, including your invoices. Don't share it or paste it anywhere else.</p>
      <input type="password" id="connectToken" class="connect-input" placeholder="Paste your token" spellcheck="false" autocapitalize="off" required>
      <button type="submit" class="gbtn" id="connectGo">Connect</button>
      <p class="connect-small">Collab Digest uses it to read the board, and to post an update only when you do it from Post update. It's kept sealed in a cookie on this browser (signing out removes it), and on the server only if you get the morning Slack briefing.</p>
      <div class="connect-links"><a href="/guide#token">Help</a><button type="button" id="connectCancel" hidden>Cancel</button><button type="button" id="connectOff" hidden>Disconnect</button><button type="button" id="connectOut">Sign out</button></div>
    </form>
    <div class="note err" id="connectErr" hidden></div>
  </div>`);
  const connect = document.getElementById("connect");
  const connectErr = msg => { const el = document.getElementById("connectErr"); el.textContent = msg || ""; el.hidden = !msg; };
  const dropCache = () => { try { Object.keys(localStorage).filter((k) => k.startsWith("cd.cache.")).forEach((k) => localStorage.removeItem(k)); } catch (e) {} };
  const post = (path, method, data) => fetch(path, { method, headers: { "content-type": "application/json" }, credentials: "same-origin", body: data ? JSON.stringify(data) : undefined })
    .then(r => r.json().catch(() => ({})).then(j => { if (!r.ok) throw j.error || { message: "Something went wrong. Try again." }; return j; }));
  function showConnect(msg, { canCancel = false, connected = false } = {}) {
    if (page === "guide" && !canCancel) return;
    menu.hidden = true;
    document.getElementById("connectCancel").hidden = !canCancel;
    document.getElementById("connectOff").hidden = !connected;
    connectErr(msg);
    connect.hidden = false;
    body.classList.add("connecting");
    setTimeout(() => document.getElementById("connectToken").focus(), 0);
  }
  document.getElementById("connectForm").onsubmit = async e => {
    e.preventDefault();
    const go = document.getElementById("connectGo"), input = document.getElementById("connectToken");
    go.disabled = true; go.textContent = "Checking…"; connectErr("");
    try {
      await post("/api/auth/monday-token", "POST", { token: input.value.trim() });
      input.value = ""; dropCache(); location.reload();
    } catch (err) {
      connectErr(err.message || "Couldn't connect. Try again.");
      go.disabled = false; go.textContent = "Connect";
    }
  };
  document.getElementById("connectCancel").onclick = () => { connect.hidden = true; body.classList.remove("connecting"); connectErr(""); };
  document.getElementById("connectOff").onclick = async () => { try { await post("/api/auth/monday-token", "DELETE"); } catch (e) {} dropCache(); location.reload(); };
  document.getElementById("connectOut").onclick = () => document.getElementById("signout").click();
  document.getElementById("mondayBtn").onclick = () => showConnect("", { canCancel: true, connected: true });

  /* who is signed in: fills the avatar; public pages show themselves straight away */
  const initials = s => String(s || "").split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";
  window.Shell = {
    config: fetch("/api/config", { credentials: "same-origin" }).then(r => r.json()).catch(() => ({})),
    setUser(user) {
      document.getElementById("signinLink").hidden = !!user;
      avatarBtn.hidden = !user;
      if (!user) {
        menu.hidden = true;
        /* signed out: drop the saved copies of this person's collabs */
        try { Object.keys(localStorage).filter((k) => k.startsWith("cd.cache.")).forEach((k) => localStorage.removeItem(k)); } catch (e) {}
        return;
      }
      avatarBtn.textContent = initials(user.name || user.email);
      avatarBtn.setAttribute("aria-label", "Account: " + (user.name || user.email));
      document.getElementById("whoName").textContent = user.name || "";
      document.getElementById("whoMail").textContent = user.email || "";
    },
    /* called by collabs.js when Monday says the token is missing or no longer works */
    connectMonday(code) {
      showConnect(code === "monday_token" ? "Monday.com stopped accepting your token. It may have been regenerated. Paste the current one." : "");
    },
  };
  window.Shell.config.then(cfg => {
    window.Shell.setUser(cfg.signedIn ? cfg.user : null);
    if (cfg.domain) document.getElementById("gateDomain").textContent = "@" + cfg.domain;
    if (cfg.signedIn) {
      document.getElementById("whoMonday").textContent = cfg.monday ? "Monday.com: " + cfg.monday.name : "Monday.com not connected";
      if (!cfg.monday) showConnect("");
    }
    if (body.dataset.auth === "public") app.hidden = false;
  });
})();
