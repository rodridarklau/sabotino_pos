require("dotenv").config({ quiet: true });
const { estadoConfiguracion, configurado } = require("../src/services/correo");

const { clave, remitente } = estadoConfiguracion();
console.log(`SABOTINO_RESEND_API_KEY: ${clave}`);
console.log(`SABOTINO_CORREO_REMITENTE: ${remitente}`);
console.log("La verificación local no contacta a Resend ni envía correos.");
if (!configurado()) process.exitCode = 1;
