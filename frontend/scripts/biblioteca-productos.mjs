import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const carpeta = new URL("../public/productos-base/", import.meta.url);
const path = (d, fill, stroke = "none", w = 4) => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const e = (cx, cy, rx, ry, fill) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
const r = (x, y, w, h, fill, radio = 8) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radio}" fill="${fill}"/>`;
const g = (t, dibujo) => `<g transform="${t}">${dibujo}</g>`;
const trazos = (arr, color, w = 4) => arr.map((d) => path(d, "none", color, w)).join("");
const migas = (puntos, color) => puntos.map(([x, y, a]) => e(x, y, a, a * .73, color)).join("");
const dorado = "url(#horno)";
const crema = "#fff2cf";
const chocolate = "#59342e";
const miga = "#e5a551";
const migasPan = [[90,139,3],[110,151,2],[143,134,3],[158,150,2],[116,126,2],[133,157,2]];

function pan(tipo) {
  switch (tipo) {
    case "amasado": return path("M48 150 C48 100 78 77 126 76 C174 77 205 102 205 150 Q198 178 129 182 Q57 180 48 150Z", dorado)
      + trazos(["M70 122Q97 92 128 96","M120 114q28-23 54-5"], "#f8d89c", 6) + migas(migasPan, "#ae6635");
    case "hallulla": return e(128,147,78,35,"#ac622e") + e(128,132,78,38,dorado)
      + migas([[84,126,4],[110,116,4],[137,119,4],[161,124,4],[101,144,4],[129,143,4],[154,146,4]],"#9a542c");
    case "marraqueta": return [[83,119],[122,104],[136,151],[172,134]].map(([x,y])=>e(x,y,39,31,dorado)).join("")
      + trazos(["M62 118q18-24 41-14","M115 100q20-18 41-10","M112 151q19-19 39-14","M158 134q14-22 31-17"],"#f9d49b",6);
    case "croissant": return path("M43 162Q44 99 103 79Q128 69 153 79Q213 100 213 162L177 151Q176 134 156 129L145 151Q129 159 110 151L100 129Q80 133 78 151Z",dorado)
      + trazos(["M54 122l31 10","M73 95l27 30","M99 82l14 67","M156 82l-13 67","M181 95l-25 30","M201 122l-30 11"],"#a95c2d",5);
    default: return g("rotate(-26 128 128)",r(28,101,200,59,dorado,28)
      + trazos(["M63 110l19 29","M103 109l19 30","M144 109l19 30","M184 110l14 26"],"#ffdeb0",8));
  }
}

function porcion(capas, cobertura, adorno = "") {
  const h = 56 / capas.length;
  return path("M66 128L137 72l60 42v61l-60 20-71-19z", "#a46741")
    + capas.map((color,i)=>path(`M66 ${127+i*h}l71 18 60-24v${h+1}l-60 24-71-18z`,color)).join("")
    + path("M66 127l71-55 60 43-60 30z",cobertura) + adorno;
}
const frutilla = (x,y) => g(`translate(${x} ${y})`,path("M-15-9Q-4-19 0-9Q12-20 16-6Q15 9 0 19Q-14 7-15-9Z","#c84a54")
  + path("M-11-11l10 3 9-8-6 10-6 2z","#527747") + migas([[-5,0,1],[6,0,1],[0,7,1]],"#ffce8b"));
const cremaPico = (x,y) => g(`translate(${x} ${y})`,path("M-23 11Q-27 2-14-4Q-19-10-8-15Q-12-23 4-29Q2-19 16-12Q27-5 18 0Q33 11 18 15Q-2 22-23 11Z","#fff0d8"));
function muffin(color, copa, chips = "") {
  return path("M75 130h106l-12 49q-40 17-82 0z",color)
    + trazos(["M92 141l5 35","M113 144l3 39","M139 144l-1 39","M162 141l-4 35"],"#a8644b",3)
    + path("M65 131Q60 112 79 105Q83 76 126 73Q168 74 178 104Q197 112 190 132Q124 153 65 131Z",copa) + chips;
}
function tarta(relleno, adorno) {
  return e(128,152,75,34,"#b76c35") + e(128,142,75,32,dorado) + e(128,136,62,24,relleno)
    + adorno + trazos(["M61 151l4 11","M77 163l4 10","M96 170l3 10","M122 175v9","M146 173l-3 11","M170 167l-4 10","M189 158l-5 10"],"#ae682e",3);
}
function dona(glaseado) {
  return path("M128 84C172 84 207 111 207 141S172 184 128 184S49 168 49 141S84 84 128 84ZM128 114c-19 0-33 9-33 19s14 17 33 17 33-7 33-17-14-19-33-19Z",dorado)
    + (glaseado ? path("M128 88C169 88 198 105 202 133q-6 11-18 6-9 14-24 4 8-17-14-26-25-9-46 2-13 8-8 22-17 10-23-3-13 6-16-5 6-33 43-43z",chocolate)
      + trazos(["M81 115l7-4","M112 99l7 3","M146 100l7-3","M176 111l5 7","M183 130l7 0"],"#f2c59f",4)
      : migas([[75,127,3],[89,151,3],[117,101,3],[149,104,3],[182,139,3],[142,167,3]],"#fff3dc"));
}
function empanada(queso) {
  return queso
    ? path("M55 148L77 87Q126 77 181 88L202 150Q132 191 55 148Z",dorado)
      + trazos(["M60 145q12 13 24 6t24 8 24 1 24-1 24-7 18-6","M112 106l22 1 M118 115l17 1"],"#ad612f",4)
    : path("M46 157Q61 84 130 85Q189 86 211 155L181 175l-106 2z",dorado)
      + path("M48 155q41-11 81 1 42-12 80-1l-28 20-106 2z","#af622a")
      + trazos(["M69 150q11 13 22 6t22 5 22 0 22-5 24-5","M113 111l15-9 M133 116l13-7"],"#f8d095",4);
}
function taza(te) {
  return e(128,171,77,20,"#dec5a4") + e(126,167,74,17,"#f6e8d1")
    + path("M165 106q41-13 39 17-4 23-35 24","none",te ? "#c58a63" : "#ece0c8",12)
    + path("M68 97h108l-9 53q-9 20-45 20t-44-20Z",te ? "#d3a280" : "#fff8e8")
    + e(122,97,54,15,te ? "#b57642" : chocolate)
    + (te ? trazos(["M142 101l12 21v22"],"#fff1da",2)+r(148,140,14,15,"#74563e",2)
      : path("M102 99q10-13 19-4 10-9 21 4-9 7-20 9z","#f5d6aa"));
}

const lista = [
  ["pan-amasado","Pan amasado","Panadería",pan("amasado"),["pan casero"]],
  ["hallulla","Hallulla","Panadería",pan("hallulla"),["pan hallulla"]],
  ["marraqueta","Marraqueta","Panadería",pan("marraqueta"),["pan batido","pan francés"]],
  ["croissant","Croissant","Panadería",pan("croissant"),["medialuna"]],
  ["baguette","Baguette","Panadería",pan("baguette"),["baguet"]],
  ["torta-chocolate","Torta de chocolate","Tortas",porcion([chocolate,"#9b6750",chocolate,"#a06b4d"],"#66403a",migas([[123,113,4],[143,102,5],[156,116,4]],"#372322")),["pastel de chocolate"]],
  ["torta-manjar","Torta de manjar","Tortas",porcion(["#deb272","#a66539","#deb272","#a66539"],"#ba8152",trazos(["M118 118q20-26 45-6","M112 126q24-20 45-3"],crema,3)),["dulce de leche"]],
  ["torta-tres-leches","Torta de tres leches","Tortas",porcion(["#f6dcad","#ffefcf","#edd09e"],"#fff7dc",cremaPico(139,99)),["tres leches"]],
  ["cheesecake-frutilla","Cheesecake de frutilla","Tortas",porcion(["#fbefd5","#fff4d6","#b67744"],"#c95565",frutilla(138,100)),["queso y fresa","cheesecake de fresa"]],
  ["torta-milhojas","Torta milhojas","Tortas",porcion(["#f5cd8b","#b57638","#f9d59b","#a96438","#f5cd8b","#b57638","#efc07d"],"#ecd09a",migas([[113,119,5],[131,103,5],[147,114,7],[160,118,4]],"#ad7442")),["mil hojas","torta de hojas"]],
  ["brownie","Brownie","Pastelería individual",g("rotate(-10 128 128)",r(66,94,124,83,"#4b2825",8)+r(63,89,125,70,"#775047",8)+trazos(["M76 113l23-6 13 9 19-13 23 8","M99 138l14-10 19 9 29-9"],"#392321",4)),["brownies"]],
  ["muffin-chocolate","Muffin de chocolate","Pastelería individual",muffin("#bd7c65","#765047",migas([[91,111,5],[110,93,6],[128,107,5],[153,95,5],[166,118,5]],"#3a2522")),["muffin cacao"]],
  ["muffin-vainilla","Muffin de vainilla","Pastelería individual",muffin("#dba779",miga,migas([[92,116,3],[114,94,3],[136,108,3],[156,101,3]],"#b56f35")),["muffin de vainilla"]],
  ["cupcake","Cupcake","Pastelería individual",path("M76 138h104l-14 43q-37 10-76 0z","#d59a8e")+g("translate(128 119) scale(2.2)",cremaPico(0,0))+migas([[95,128,3],[136,121,3],[122,103,4],[152,134,3]],"#b85d70"),["magdalena decorada"]],
  ["kuchen-manzana","Kuchen de manzana","Pastelería individual",tarta("#e7b369",Array.from({length:6},(_,i)=>path(`M${74+i*17} 136q7-20 20-22`,"none",i%2?"#edca82":"#af5d3f",6)).join("")),["tarta de manzana"]],
  ["kuchen-frambuesa","Kuchen de frambuesa","Pastelería individual",tarta("#a23d56",migas([[85,132,9],[104,125,10],[128,135,11],[152,126,10],[171,138,8],[105,144,9],[151,143,10]],"#d35d79")),["tarta de frambuesa"]],
  ["pie-limon","Pie de limón","Pastelería individual",porcion(["#ffe599","#fff0b5","#dba761"],"#fff5dc",cremaPico(135,102)+path("M149 107l25-14q11 17-2 30z","#e5c951")),["pie de limon","lemon pie"]],
  ["tartaleta-frutas","Tartaleta de frutas","Pastelería individual",tarta("#f2d7a1",frutilla(112,121)+frutilla(155,129)+migas([[86,136,7],[126,145,8],[173,142,7]],"#527895")+e(138,119,13,8,"#88a65b")),["tartaleta de fruta"]],
  ["berlin","Berlín","Bollería y dulces",e(128,141,76,40,dorado)+path("M58 144q67 19 139-2l-6 10q-62 19-126 1z","#fce0a9")+migas([[83,120,4],[102,107,3],[118,123,4],[137,111,3],[159,123,4],[177,128,3]],"#fff0d0"),["berlin","berlines"]],
  ["dona-chocolate","Dona de chocolate","Bollería y dulces",dona(true),["donut de chocolate","rosquilla de chocolate"]],
  ["roll-canela","Roll de canela","Bollería y dulces",e(129,143,75,40,"#a55c36")+e(129,133,75,40,dorado)+trazos(["M162 143q13-30-32-32-38-1-38 22 0 21 34 20 23-2 21-13-2-10-18-9-12 1-9 7"],"#914c2e",8)+trazos(["M73 137q46 18 109-6","M88 111q36 16 75-5"],"#f2dab5",3),["rollo de canela","cinnamon roll"]],
  ["alfajor","Alfajor","Bollería y dulces",e(129,157,67,31,"#a9673e")+e(129,147,68,30,"#784332")+e(129,137,67,31,"#c18953")+e(129,131,65,27,"#f6ddba")+migas([[95,136,2],[111,122,3],[135,139,2],[158,124,3]],"#cb9a6e"),["alfajores"]],
  ["galleta-chips-chocolate","Galleta con chips de chocolate","Bollería y dulces",e(128,144,77,42,"#b96d35")+e(128,135,77,42,dorado)+migas([[81,133,7],[107,119,6],[119,148,7],[143,115,6],[156,138,8],[178,125,5],[169,155,6],[93,157,4]],chocolate),["cookie","galleta chips"]],
  ["brazo-reina","Brazo de reina","Bollería y dulces",path("M61 109Q80 79 154 98l41 27-26 56Q93 191 61 151z",dorado)+e(170,143,39,39,"#d9914f")+e(171,142,34,34,"#f0d4a0")+trazos(["M187 151q-1-23-22-21-16 3-11 18 6 11 17 5 6-6-1-10"],"#9b5a3f",6),["brazo de reina","arrollado dulce"]],
  ["queque-marmol","Queque de mármol","Bollería y dulces",path("M68 153V99q17-29 58-17 52-17 67 22v55l-44 26z",dorado)+path("M68 104q25-24 58-11 39-9 52 14v52l-39 18-71-22z","#efc889")+path("M75 141q21-32 47-19 26 8 45-10l9 14q-13 26-45 18-23-10-44 7z","#845144"),["bizcocho marmolado","queque marmolado"]],
  ["empanada-pino","Empanada de pino","Salados",empanada(false),["empanada de carne"]],
  ["empanada-queso","Empanada de queso","Salados",empanada(true),["empanada queso"]],
  ["cafe","Café","Bebidas",taza(false),["espresso","cafe","capuccino"]],
  ["te","Té","Bebidas",taza(true),["te negro","infusión"]],
  ["jugo-natural","Jugo natural","Bebidas",path("M80 79h96l-12 112H92z","#f8e7ce","#c7b398")+path("M85 103h86l-10 84H95z","#efa445")+e(128,103,43,8,"#f6c076")+trazos(["M112 125l5 43","M147 94l13-42 18-6"],"#fff3d5",6)+e(171,87,19,19,"#d98136")+e(171,87,15,15,"#ffd186")+trazos(["M162 81l18 12","M168 75l4 24"],"#fdf0c9",2),["zumo","jugo de naranja"]]
];

const manifiesto = lista.map(([id,nombre,categoria,,sinonimos]) => ({
  id, nombre, categoria, ruta: `/productos-base/${id}.svg`, sinonimos, origen: "ilustración local"
}));
const comprobar = process.argv.includes("--verificar");
await mkdir(carpeta, { recursive: true });
if (comprobar) {
  const publicado = JSON.parse(await readFile(new URL("manifiesto.json", carpeta), "utf8"));
  assert.deepEqual(publicado, manifiesto);
}
assert.equal(lista.length, 30);
assert.equal(new Set(lista.map(([, , , dibujo]) => dibujo)).size, 30);
for (const [id, , , dibujo] of lista) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 256 256"><defs><radialGradient id="fondo"><stop stop-color="#fffdf7"/><stop offset="1" stop-color="#f4ede0"/></radialGradient><linearGradient id="horno" x2=".2" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="#f7cd87"/><stop offset="1" stop-color="#c67e43"/></linearGradient></defs><rect width="256" height="256" fill="url(#fondo)"/><ellipse cx="129" cy="190" rx="86" ry="12" fill="#8a603b" opacity=".12"/>${dibujo}</svg>\n`;
  const archivo = new URL(`${id}.svg`, carpeta);
  if (comprobar) assert.equal(await readFile(archivo, "utf8"), svg);
  else await writeFile(archivo, svg);
}
if (!comprobar) await writeFile(new URL("manifiesto.json", carpeta), JSON.stringify(manifiesto, null, 2) + "\n");
console.log(`${lista.length} ilustraciones ${comprobar ? "verificadas" : "generadas"} en ${fileURLToPath(carpeta)}`);
