const { exec, execSync } = require("child_process");
const express = require("express");
const path = require("path");
const fs = require("fs");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// Configuración y constantes
const downloadsDir = path.join(__dirname, "downloads");
const MAX_FILES = 5;
const cookiesFilePath = path.join(__dirname, "cookies.txt");

// Crear el directorio de descargas si no existe
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir);
}

// Middleware para servir archivos estáticos
app.use(express.static(path.join(__dirname, "public")));

// Verifica si las cookies existen y son válidas
function areCookiesValid() {
    if (!fs.existsSync(cookiesFilePath)) {
        console.warn("⚠️ Advertencia: El archivo cookies.txt no existe.");
        return false;
    }

    const cookies = fs.readFileSync(cookiesFilePath, "utf8");
    if (!cookies.includes("LOGIN_INFO") && !cookies.includes("SID")) {
        console.warn("⚠️ Advertencia: Las cookies podrían estar caducadas o mal formateadas.");
        return false;
    }

    console.log("✅ Cookies detectadas correctamente.");
    return true;
}

// Función para limpiar descargas si excede el límite
function cleanDownloadsIfNeeded() {
    const files = fs.readdirSync(downloadsDir).map((file) => {
        const filePath = path.join(downloadsDir, file);
        const stats = fs.statSync(filePath);
        return { filePath, mtime: stats.mtimeMs };
    });

    if (files.length > MAX_FILES) {
        files.sort((a, b) => a.mtime - b.mtime);
        const filesToDelete = files.slice(0, files.length - MAX_FILES);

        filesToDelete.forEach(({ filePath }) => {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Archivo eliminado: ${filePath}`);
        });
    }
}

// Función de retraso
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Ruta para obtener detalles del video
app.get("/video-details", async (req, res) => {
    const videoUrl = req.query.url;
    await delay(10000); // Reducir la frecuencia de las solicitudes

    let videoTitle = "video";
    let videoThumbnail = "";
    
    try {
        const cookieOption = areCookiesValid() ? `--cookies ${cookiesFilePath}` : ""; // Usar cookies desde archivo
        videoTitle = execSync(`yt-dlp ${cookieOption} --get-title "${videoUrl}"`).toString().trim();
        videoThumbnail = execSync(`yt-dlp ${cookieOption} --get-thumbnail "${videoUrl}"`).toString().trim();
        videoTitle = videoTitle.replace(/[^\w\s]/gi, "_");
    } catch (error) {
        console.error("❌ Error al obtener los detalles del video:", error);
        return res.json({ error: "Error al obtener los detalles del video." });
    }

    res.json({ title: videoTitle, thumbnail: videoThumbnail });
});

// Ruta para descargar videos o audio
app.get("/download", async (req, res) => {
    const videoUrl = req.query.url;
    const format = req.query.format;

    if (!videoUrl || !format) {
        console.log("❌ URL o formato no proporcionado.");
        return res.status(400).send("URL o formato no proporcionado.");
    }

    let videoTitle = "video";
    await delay(10000); // Reducir la frecuencia de las solicitudes

    try {
        const cookieOption = areCookiesValid() ? `--cookies ${cookiesFilePath}` : ""; // Usar cookies desde archivo
        videoTitle = execSync(`yt-dlp ${cookieOption} --get-title "${videoUrl}"`).toString().trim();
        videoTitle = videoTitle.replace(/[^\w\s]/gi, "_");
        console.log("🎥 Título del video:", videoTitle);
    } catch (error) {
        console.error("❌ Error al obtener el título del video:", error);
        return res.status(500).send("Error al obtener el título del video.");
    }

    const outputPath = path.join(downloadsDir, `${videoTitle}.${format}`);
    const downloadCookieOption = areCookiesValid() ? `--cookies ${cookiesFilePath}` : ""; // Usar cookies si son válidas

    let command;
    if (format === "mp4") {
        command = `yt-dlp ${downloadCookieOption} -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4" -o "${outputPath}" "${videoUrl}"`;
    } else if (format === "mp3") {
        command = `yt-dlp ${downloadCookieOption} -x --audio-format mp3 -o "${outputPath}" "${videoUrl}"`;
    } else {
        return res.status(400).send("Formato no soportado.");
    }

    console.log("🚀 Ejecutando:", command);
    const downloadProcess = exec(command);

    downloadProcess.stdout.on("data", (data) => {
        console.log("📥 Descargando:", data);
        const progressMatch = data.match(/(\d+\.\d+)%/);
        if (progressMatch) {
            const progress = parseFloat(progressMatch[1]);
            io.emit("progress", progress);
        }
    });

    downloadProcess.stderr.on("data", (data) => {
        console.error("⚠️ Error en la descarga:", data);
    });

    downloadProcess.on("close", (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
            res.setHeader("Content-Disposition", `attachment; filename="${videoTitle}.${format}"`);
            res.download(outputPath, (err) => {
                if (!err) {
                    fs.unlinkSync(outputPath);
                    cleanDownloadsIfNeeded();
                } else {
                    console.error("❌ Error al enviar el archivo:", err);
                    res.status(500).send("Error al enviar el archivo.");
                }
            });
        } else {
            console.error("❌ El archivo de descarga no se generó.");
            res.status(500).send("Error: El archivo no se generó.");
        }
    });
});

// Iniciar el servidor
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});

// Emitir progreso al cliente
io.on("connection", (socket) => {
    console.log("🔗 Cliente conectado.");
    socket.on("disconnect", () => {
        console.log("❌ Cliente desconectado.");
    });
});
