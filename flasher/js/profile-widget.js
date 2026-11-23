import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../../shared/js/config.js";

const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;

async function cropAvatar(file, maxDim = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = maxDim;
      c.height = maxDim;
      const ctx = c.getContext("2d");
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, maxDim, maxDim);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("Encode error"))), "image/jpeg", 0.88);
    };
    reader.readAsDataURL(file);
  });
}

function injectStyles() {
  if (document.getElementById("mxProfileWidgetCss")) return;
  const style = document.createElement("style");
  style.id = "mxProfileWidgetCss";
  style.textContent = `
    .mx-acct-btn{display:inline-flex;align-items:center;gap:8px;padding:4px 11px 4px 5px;border-radius:999px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.04);color:#fff;font-family:inherit;font-size:12.5px;font-weight:500;cursor:pointer;margin-left:8px;transition:all .16s ease}
    .mx-acct-btn:hover{border-color:rgba(0,255,195,0.45);background:rgba(0,255,195,0.08)}
    .mx-acct-av{width:26px;height:26px;border-radius:50%;background:rgba(0,255,195,0.14);border:1px solid rgba(0,255,195,0.38);color:#00ffc3;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;overflow:hidden}
    .mx-acct-av img{width:100%;height:100%;object-fit:cover}
    .mx-prof-backdrop{position:fixed;inset:0;z-index:120;background:rgba(0,0,0,0.82);backdrop-filter:blur(12px);display:none;align-items:center;justify-content:center;padding:18px}
    .mx-prof-backdrop.open{display:flex}
    .mx-prof-modal{width:100%;max-width:540px;max-height:90vh;overflow-y:auto;background:#09090b;border:1px solid rgba(0,255,195,0.32);border-radius:20px;padding:24px;box-shadow:0 28px 80px rgba(0,0,0,0.85),0 0 36px rgba(0,255,195,0.10);color:#fff}
    .mx-prof-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.08)}
    .mx-prof-title{font-size:17px;font-weight:600;letter-spacing:-0.01em}
    .mx-prof-x{border:1px solid rgba(255,255,255,0.14);background:transparent;color:rgba(255,255,255,0.7);border-radius:8px;padding:4px 9px;cursor:pointer}
    .mx-prof-sec{margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.08)}
    .mx-prof-lbl{display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.5);margin-bottom:5px}
    .mx-prof-in{width:100%;padding:9px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.04);color:#fff;font-size:13px;font-family:inherit;margin-bottom:10px;outline:none}
    .mx-prof-in:focus{border-color:#00ffc3}
    .mx-prof-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .mx-prof-btn{border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.06);color:#fff;padding:8px 14px;border-radius:10px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit}
    .mx-prof-btn.mint{background:#00ffc3;border-color:#00ffc3;color:#000;box-shadow:0 0 18px rgba(0,255,195,0.28)}
    .mx-prof-btn.danger{border-color:rgba(255,77,94,0.4);background:rgba(255,77,94,0.12);color:#ff6b7a}
    .mx-prof-msg{margin-top:10px;padding:9px 12px;border-radius:10px;font-size:12.5px;display:none}
    .mx-prof-msg.ok{display:block;background:rgba(0,255,195,0.10);border:1px solid rgba(0,255,195,0.32);color:#00ffc3}
    .mx-prof-msg.err{display:block;background:rgba(255,77,94,0.12);border:1px solid rgba(255,77,94,0.32);color:#fca5a5}
  `;
  document.head.appendChild(style);
}

function setMsg(text, ok = true) {
  const el = document.getElementById("mxProfMsg");
  if (!el) return;
  el.textContent = text;
  el.className = `mx-prof-msg ${ok ? "ok" : "err"}`;
}

function renderModalBody() {
  const body = document.getElementById("mxProfBody");
  if (!body) return;

  if (!currentUser) {
    body.innerHTML = `
      <p style="font-size:13px;color:rgba(255,255,255,0.62);margin-bottom:14px;">
        Sign in with your MAICXEN Supabase account to manage your unified profile &amp; avatar. Web Flasher remains usable without signing in.
      </p>
      <form id="mxFlasherLoginForm">
        <label class="mx-prof-lbl">Email</label>
        <input class="mx-prof-in" type="email" id="mxLoginEmail" required placeholder="info@maicxen.it" />
        <label class="mx-prof-lbl">Password</label>
        <input class="mx-prof-in" type="password" id="mxLoginPass" required placeholder="••••••••" />
        <button type="submit" class="mx-prof-btn mint" style="width:100%;margin-top:4px;">Sign In</button>
      </form>
      <div id="mxProfMsg" class="mx-prof-msg"></div>
    `;
    document.getElementById("mxFlasherLoginForm").onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById("mxLoginEmail").value.trim().toLowerCase();
      const password = document.getElementById("mxLoginPass").value;
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message, false);
      else await refreshAuth();
    };
    return;
  }

  const meta = currentUser.user_metadata || {};
  const fullName = currentProfile?.full_name || meta.full_name || "";
  const username = currentProfile?.username || meta.username || "";
  const avUrl = currentProfile?.avatar_url || "";
  const init = (fullName || username || currentUser.email || "U")[0].toUpperCase();

  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;">
      <div class="mx-acct-av" style="width:52px;height:52px;font-size:18px;">${avUrl ? `<img src="${avUrl}" />` : init}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:15px;">${fullName || username || "User"}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.55);">${currentUser.email} · ${(currentProfile?.role || "viewer").toUpperCase()}</div>
      </div>
      <input type="file" id="mxAvFile" accept="image/*" style="display:none;" />
      <button type="button" class="mx-prof-btn" id="mxAvBtn">Photo</button>
      ${avUrl ? `<button type="button" class="mx-prof-btn danger" id="mxAvDelBtn">Remove</button>` : ""}
    </div>

    <div class="mx-prof-sec">
      <div class="mx-prof-grid">
        <div><label class="mx-prof-lbl">Full Name *</label><input class="mx-prof-in" id="mxFullName" value="${fullName}" /></div>
        <div><label class="mx-prof-lbl">Username *</label><input class="mx-prof-in" id="mxUsername" value="${username}" /></div>
        <div><label class="mx-prof-lbl">Job Title</label><input class="mx-prof-in" id="mxJob" value="${meta.job_title || ""}" /></div>
        <div><label class="mx-prof-lbl">Phone</label><input class="mx-prof-in" id="mxPhone" value="${meta.phone || ""}" /></div>
      </div>
      <button type="button" class="mx-prof-btn mint" id="mxSaveIdBtn">Save Profile</button>
    </div>

    <div class="mx-prof-sec">
      <label class="mx-prof-lbl">Change Email (Password + Email Confirmation Required)</label>
      <div class="mx-prof-grid">
        <input class="mx-prof-in" type="email" id="mxNewEmail" placeholder="new@maicxen.it" />
        <input class="mx-prof-in" type="password" id="mxEmailPass" placeholder="Current Password *" />
      </div>
      <button type="button" class="mx-prof-btn" id="mxSaveEmailBtn">Request Email Change</button>
    </div>

    <div class="mx-prof-sec">
      <label class="mx-prof-lbl">Change Password (Current Password Required, 8+ chars)</label>
      <input class="mx-prof-in" type="password" id="mxCurPass" placeholder="Current Password *" />
      <div class="mx-prof-grid">
        <input class="mx-prof-in" type="password" id="mxNewPass" placeholder="New Password (8+)" />
        <input class="mx-prof-in" type="password" id="mxConfPass" placeholder="Confirm New Password" />
      </div>
      <button type="button" class="mx-prof-btn" id="mxSavePassBtn">Update Password</button>
    </div>

    <div class="mx-prof-sec" style="display:flex;justify-content:space-between;gap:8px;">
      <button type="button" class="mx-prof-btn danger" id="mxSignOutAllBtn">Sign Out All Devices</button>
      <button type="button" class="mx-prof-btn" id="mxSignOutBtn">Sign Out</button>
    </div>
    <div id="mxProfMsg" class="mx-prof-msg"></div>
  `;

  document.getElementById("mxAvBtn").onclick = () => document.getElementById("mxAvFile").click();
  document.getElementById("mxAvFile").onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const blob = await cropAvatar(f, 256);
      const path = `${currentUser.id}/avatar.jpg`;
      const { error: uErr } = await sb.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (uErr) throw uErr;
      const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);
      const url = `${pub.publicUrl}?t=${Date.now()}`;
      const { error: dErr } = await sb.from("user_profiles").update({ avatar_url: url }).eq("id", currentUser.id);
      if (dErr) throw dErr;
      await refreshAuth();
      setMsg("Profile photo updated!");
    } catch (err) { setMsg(err.message || "Upload failed", false); }
  };

  const delBtn = document.getElementById("mxAvDelBtn");
  if (delBtn) {
    delBtn.onclick = async () => {
      await sb.from("user_profiles").update({ avatar_url: "" }).eq("id", currentUser.id);
      await refreshAuth();
      setMsg("Photo removed.");
    };
  }

  document.getElementById("mxSaveIdBtn").onclick = async () => {
    const fn = document.getElementById("mxFullName").value.trim();
    const un = document.getElementById("mxUsername").value.trim();
    const job = document.getElementById("mxJob").value.trim();
    const phone = document.getElementById("mxPhone").value.trim();
    if (!fn || !un) return setMsg("Full Name and Username are required.", false);
    const { error } = await sb.from("user_profiles").update({ full_name: fn, username: un }).eq("id", currentUser.id);
    if (error) return setMsg(error.message, false);
    await sb.auth.updateUser({ data: { full_name: fn, username: un, job_title: job, phone } });
    await refreshAuth();
    setMsg("Profile saved across all MAICXEN portals.");
  };

  document.getElementById("mxSaveEmailBtn").onclick = async () => {
    const ne = document.getElementById("mxNewEmail").value.trim().toLowerCase();
    const pw = document.getElementById("mxEmailPass").value;
    if (!ne || !pw) return setMsg("New email and current password are required.", false);
    const { error: vErr } = await sb.auth.signInWithPassword({ email: currentUser.email, password: pw });
    if (vErr) return setMsg("Current password verification failed.", false);
    const { error } = await sb.auth.updateUser({ email: ne }, { emailRedirectTo: window.location.origin });
    if (error) return setMsg(error.message, false);
    setMsg(`Confirmation email sent to ${ne}. Confirm via inbox link.`);
  };

  document.getElementById("mxSavePassBtn").onclick = async () => {
    const cp = document.getElementById("mxCurPass").value;
    const np = document.getElementById("mxNewPass").value;
    const cf = document.getElementById("mxConfPass").value;
    if (!cp || np.length < 8 || np !== cf) return setMsg("Verify current password and enter matching 8+ char password.", false);
    const { error: vErr } = await sb.auth.signInWithPassword({ email: currentUser.email, password: cp });
    if (vErr) return setMsg("Current password is incorrect.", false);
    const { error } = await sb.auth.updateUser({ password: np });
    if (error) return setMsg(error.message, false);
    setMsg("Password updated successfully.");
  };

  document.getElementById("mxSignOutBtn").onclick = async () => {
    await sb.auth.signOut();
    await refreshAuth();
  };
  document.getElementById("mxSignOutAllBtn").onclick = async () => {
    await sb.auth.signOut({ scope: "global" });
    await refreshAuth();
  };
}

function updateTopbarChip() {
  const btn = document.getElementById("mxFlasherAcctBtn");
  if (!btn) return;
  if (!currentUser) {
    btn.innerHTML = `<span class="mx-acct-av">U</span><span>Account</span>`;
    return;
  }
  const name = currentProfile?.username || currentProfile?.full_name || currentUser.email.split("@")[0];
  const av = currentProfile?.avatar_url;
  const init = (name || "U")[0].toUpperCase();
  btn.innerHTML = `<span class="mx-acct-av">${av ? `<img src="${av}" />` : init}</span><span>${name}</span>`;
}

async function refreshAuth() {
  if (!sb) return;
  const { data: { user } } = await sb.auth.getUser();
  currentUser = user || null;
  if (currentUser) {
    const { data } = await sb.from("user_profiles").select("*").eq("id", currentUser.id).maybeSingle();
    currentProfile = data || null;
  } else {
    currentProfile = null;
  }
  updateTopbarChip();
  renderModalBody();
}

function mountProfileWidget() {
  if (!sb) return;
  injectStyles();
  const actions = document.querySelector(".topbar-actions");
  if (actions && !document.getElementById("mxFlasherAcctBtn")) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "mxFlasherAcctBtn";
    btn.className = "mx-acct-btn";
    btn.onclick = () => {
      document.getElementById("mxProfBackdrop")?.classList.add("open");
      renderModalBody();
    };
    actions.appendChild(btn);
  }

  if (!document.getElementById("mxProfBackdrop")) {
    const wrap = document.createElement("div");
    wrap.id = "mxProfBackdrop";
    wrap.className = "mx-prof-backdrop";
    wrap.onclick = (e) => { if (e.target === wrap) wrap.classList.remove("open"); };
    wrap.innerHTML = `
      <div class="mx-prof-modal">
        <div class="mx-prof-head">
          <span class="mx-prof-title">MAICXEN Account &amp; Profile</span>
          <button type="button" class="mx-prof-x" id="mxProfClose">✕</button>
        </div>
        <div id="mxProfBody"></div>
      </div>
    `;
    document.body.appendChild(wrap);
    document.getElementById("mxProfClose").onclick = () => wrap.classList.remove("open");
  }

  refreshAuth();
  sb.auth.onAuthStateChange(() => refreshAuth());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountProfileWidget);
} else {
  mountProfileWidget();
}
