
import { useEffect, useState } from "react";
import App from "./App.jsx";
import "./Acceso.css";

const API = "/api/auth";

function Acceso() {
  const [pantalla, setPantalla] = useState("cargando");
  const [usuario, setUsuario] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [procesando, setProcesando] = useState(false);

  const [login, setLogin] = useState({
    username: "",
    password: ""
  });

  const [registro, setRegistro] = useState({
    rut: "",
    nombreCompleto: "",
    username: "",
    password: "",
    confirmarPassword: ""
  });

  // Comprobar si existe una sesión al abrir SABOTINO
  useEffect(() => {
    let activo = true;

    async function comprobarAcceso() {
      try {
        const respuestaSesion = await fetch(`${API}/yo`);

        if (respuestaSesion.ok) {
          const datos = await respuestaSesion.json();

          if (activo) {
            setUsuario(datos.usuario);
            setPantalla("panel");
          }
          return;
        }

        if (respuestaSesion.status !== 401) {
          throw new Error("No se pudo comprobar la sesión");
        }

        const respuestaInicial = await fetch(
          `${API}/estado-inicial`
        );

        if (!respuestaInicial.ok) {
          throw new Error("No se pudo consultar la configuración");
        }

        const datos = await respuestaInicial.json();

        if (activo) {
          setPantalla(
            datos.requiereConfiguracion
              ? "configuracion"
              : "login"
          );
        }

      } catch (err) {
        console.error(err);
        if (activo) setPantalla("error");
      }
    }

    comprobarAcceso();

    return () => {
      activo = false;
    };
  }, []);

  function actualizarRegistro(evento) {
    const { name, value } = evento.target;

    setRegistro((anterior) => ({
      ...anterior,
      [name]: value
    }));
  }

  async function registrarDueno(evento) {
    evento.preventDefault();
    setError("");
    setAviso("");

    if (registro.password !== registro.confirmarPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setProcesando(true);

    try {
      const respuesta = await fetch(`${API}/configurar-dueno`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          rut: registro.rut,
          nombreCompleto: registro.nombreCompleto,
          username: registro.username,
          password: registro.password
        })
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(datos.mensaje || "Error en el registro");
      }

      setLogin({
        username: registro.username,
        password: ""
      });

      setRegistro({
        rut: "",
        nombreCompleto: "",
        username: "",
        password: "",
        confirmarPassword: ""
      });

      setAviso("Dueño registrado. Ahora puedes iniciar sesión.");
      setPantalla("login");

    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  }

  async function iniciarSesion(evento) {
    evento.preventDefault();

    setError("");
    setProcesando(true);

    try {
      const respuesta = await fetch(`${API}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify(login)
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          datos.mensaje || "No se pudo iniciar sesión"
        );
      }

      setUsuario(datos.usuario);
      setLogin({ username: "", password: "" });
      setPantalla("panel");

    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  }

  async function cerrarSesion() {
    try {
      const respuesta = await fetch(`${API}/logout`, {
        method: "POST",
        credentials: "same-origin"
      });

      if (!respuesta.ok) {
        throw new Error("No se pudo cerrar la sesión");
      }

      setUsuario(null);
      setError("");
      setAviso("");
      setPantalla("login");

    } catch (err) {
      alert(err.message);
    }
  }

  if (pantalla === "cargando") {
    return (
      <div className="acceso-pantalla">
        <p role="status">Comprobando sesión de SABOTINO…</p>
      </div>
    );
  }

  if (pantalla === "error") {
    return (
      <div className="acceso-pantalla">
        <div className="acceso-tarjeta acceso-exito">
          <h2>No se pudo conectar con el servidor</h2>
          <p>Comprueba que Express y Oracle estén funcionando.</p>
          <button onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // Mostrar el panel solamente si hay una sesión válida
  if (pantalla === "panel" && usuario) {
    return (
      <App
        usuario={usuario}
        onLogout={cerrarSesion}
      />
    );
  }

  return (
    <main className="acceso-pantalla acceso-identidad">
      <div className="acceso-marca">
        <img src="/branding/logo-sabotino.png" width="265" height="265" alt="SABOTINO Pastelería" />
      </div>
      <div className="acceso-tarjeta">

        <div className="acceso-encabezado">
          <h1>SABOTINO</h1>
          <p>Sistema de gestión comercial</p>
        </div>

        {pantalla === "login" ? (
          <>
            <div className="acceso-titulo">
              <h2>Iniciar sesión</h2>
            </div>

            <form onSubmit={iniciarSesion}>
              <label htmlFor="username">Usuario</label>
              <input
                id="username"
                name="username"
                autoComplete="username"
                placeholder="Nombre de usuario"
                value={login.username}
                onChange={(e) =>
                  setLogin({
                    ...login,
                    username: e.target.value
                  })
                }
                required
              />

              <label htmlFor="password">Contraseña</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Ingresa tu contraseña"
                value={login.password}
                onChange={(e) =>
                  setLogin({
                    ...login,
                    password: e.target.value
                  })
                }
                required
              />

              {aviso && (
                <div className="acceso-aviso" role="status">{aviso}</div>
              )}

              {error && (
                <div className="acceso-error" role="alert">{error}</div>
              )}

              <button
                className="acceso-boton"
                type="submit"
                disabled={procesando}
              >
                {procesando ? "Ingresando..." : "Iniciar sesión"}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="acceso-titulo">
              <h2>Configuración inicial</h2>
              <p>Registra al primer dueño de SABOTINO.</p>
            </div>

            <form onSubmit={registrarDueno}>
              <label>RUT del dueño</label>
              <input
                name="rut"
                placeholder="12345678-5"
                value={registro.rut}
                onChange={actualizarRegistro}
                required
              />

              <label>Nombre completo</label>
              <input
                name="nombreCompleto"
                value={registro.nombreCompleto}
                onChange={actualizarRegistro}
                required
              />

              <label>Nombre de usuario</label>
              <input
                name="username"
                autoComplete="username"
                value={registro.username}
                onChange={actualizarRegistro}
                required
              />

              <label>Contraseña</label>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                value={registro.password}
                onChange={actualizarRegistro}
                required
              />

              <label>Confirmar contraseña</label>
              <input
                name="confirmarPassword"
                type="password"
                autoComplete="new-password"
                value={registro.confirmarPassword}
                onChange={actualizarRegistro}
                required
              />

              {error && (
                <div className="acceso-error" role="alert">{error}</div>
              )}

              <button type="submit" disabled={procesando}>
                {procesando
                  ? "Registrando..."
                  : "Registrar dueño inicial"}
              </button>
            </form>
          </>
        )}

      </div>
    </main>
  );
}

export default Acceso;
