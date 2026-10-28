// Pantalla de acceso (/login). Antes estaba en línea en public/login.html (F0-11, CSP sin 'unsafe-inline').
// Cargar identidad de marca dinámica Whitelabel
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const data = await res.json();
      const brandName = data.settings?.brandName || data.brandName || "Panel";
      const botIdentity = data.settings?.botIdentity || data.botIdentity || "";

      document.title = `Acceso | ${brandName}`;

      const brandTitleEl = document.getElementById("brandTitle");
      if (brandTitleEl) brandTitleEl.textContent = botIdentity ? `Panel ${botIdentity}` : `Panel ${brandName}`;

      const brandSubEl = document.getElementById("brandSubtitle");
      if (brandSubEl) brandSubEl.textContent = `${brandName} | Acceso Administrativo`;

      const brandFooterEl = document.getElementById("brandFooter");
      if (brandFooterEl) brandFooterEl.textContent = brandName;

      const yearEl = document.getElementById("currentYear");
      if (yearEl) yearEl.textContent = new Date().getFullYear();

      if (data.settings?.theme?.logoUrl) {
        const logoEl = document.querySelector(".logo-area img.logo");
        if (logoEl) logoEl.src = data.settings.theme.logoUrl;
        const favicon = document.querySelector("link[rel~='icon']");
        if (favicon) favicon.href = data.settings.theme.logoUrl;
      }
      if (data.settings?.theme?.primaryColor) {
        document.documentElement.style.setProperty("--wa-green", data.settings.theme.primaryColor);
      }
    }
  } catch (err) {
    console.warn("No se pudo cargar la configuración de marca en login:", err);
  }
});

const form = document.getElementById("loginForm");
const errorDiv = document.getElementById("errorContainer");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const usuario = document.getElementById("usuario").value;
  const password = document.getElementById("password").value;

  errorDiv.textContent = "";
  errorDiv.style.display = "none";

  try {
    const response = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, password }),
    });

    if (response.ok) {
      const data = await response.json();
      // Guardar info del usuario para el panel
      if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
      }
      window.location.href = data.redirect || "/panel";
    } else {
      const errorData = await response.json();
      errorDiv.textContent =
        errorData.error || "Usuario o contraseña incorrectos";
      errorDiv.style.display = "block";
    }
  } catch (err) {
    errorDiv.textContent = "Error de conexión con el servidor";
    errorDiv.style.display = "block";
  }
});
