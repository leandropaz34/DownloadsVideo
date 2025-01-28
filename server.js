const { exec, execSync } = require("child_process");
const express = require("express");
const multer = require("multer");
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
const upload = multer({ dest: 'uploads/' }); // Carpeta temporal para subir archivos

// Crear el directorio de descargas si no existe
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir);
}

// Middleware para servir archivos estáticos
app.use(express.static(path.join(__dirname, "public")));

// Función de retraso
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Ruta para subir el archivo de cookies
app.post("/upload-cookies", upload.single('cookies'), (req, res) => {
    if (!req.file) {
        return res.status(400).send("No se proporcionó ningún archivo.");
    }

    // Mover el archivo de cookies a la ubicación correcta
    const cookiesFilePath = path.join(__dirname, "uploads", req.file.filename);
    res.json({ cookiesFilePath });
});

// Ruta para obtener detalles del video
app.get("/video-details", async (req, res) => {
    const videoUrl = req.query.url;
    const cookiesFilePath = req.query.cookiesFilePath;

    if (!cookiesFilePath) {
        return res.status(400).send("No se proporcionó el archivo de cookies.");
    }

    // Retraso para reducir la frecuencia de las solicitudes
    await delay(10000); // Esperar 10 segundos entre solicitudes

    // Obtenemos el título del video y la miniatura usando yt-dlp (funciona para múltiples plataformas)
    let videoTitle = "video";
    let videoThumbnail = "";
    try {
        videoTitle = execSync(`yt-dlp --force-ipv4 --cookies ${cookiesFilePath} --get-title "${videoUrl}"`).toString().trim();
        videoThumbnail = execSync(`yt-dlp --force-ipv4 --cookies ${cookiesFilePath} --get-thumbnail "${videoUrl}"`).toString().trim();
        videoTitle = videoTitle.replace(/[^\w\s]/gi, "_");
    } catch (error) {
        console.error("Error al obtener los detalles del video:", error);
        return res.json({ error: "Error al obtener los detalles del video" });
    }

    res.json({
        title: videoTitle,
        thumbnail: videoThumbnail
    });
});

// Ruta para descargar videos o audio
app.get("/download", async (req, res) => {
    const videoUrl = req.query.url;
    const format = req.query.format;
    const cookiesFilePath = req.query.cookiesFilePath;

    if (!videoUrl || !format || !cookiesFilePath) {
        return res.status(400).send("URL, formato o archivo de cookies no proporcionado.");
    }

    let videoTitle = "video";

    // Retraso para reducir la frecuencia de las solicitudes
    await delay(10000); // Esperar 10 segundos entre solicitudes

    try {
        videoTitle = execSync(`yt-dlp --force-ipv4 --cookies ${cookiesFilePath} --get-title "${videoUrl}"`).toString().trim();
        videoTitle = videoTitle.replace(/[^\w\s]/gi, "_");
        console.log("Título del video:", videoTitle);
    } catch (error) {
        console.error("Error al obtener el título del video:", error);
        return res.status(500).send("Error al obtener el título del video.");
    }

    const outputPath = path.join(downloadsDir, `${videoTitle}.${format}`);

    let command;
    if (format === 'mp4') {
        command = `yt-dlp --force-ipv4 --cookies ${cookiesFilePath} -f bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4 -o "${outputPath}" "${videoUrl}"`;
    } else if (format === 'mp3') {
        command = `yt-dlp --force-ipv4 --cookies ${cookiesFilePath} -x --audio-format mp3 -o "${outputPath}" "${videoUrl}"`;
    } else {
        return res.status(400).send("Formato no soportado.");
    }

    console.log("Comando ejecutado:", command);

    const downloadProcess = exec(command);

    downloadProcess.stdout.on("data", (data) => {
        console.log("Salida stdout:", data);
        const progressMatch = data.match(/(\d+\.\d+)%/);
        if (progressMatch) {
            const progress = parseFloat(progressMatch[1]);
            io.emit("progress", progress);
        }
    });

    downloadProcess.stderr.on("data", (data) => {
        console.error("Salida stderr:", data);
    });

    downloadProcess.on("close", (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
            res.setHeader("Content-Disposition", `attachment; filename="${videoTitle}.${format}"`);
            res.download(outputPath, (err) => {
                if (!err) {
                    fs.unlinkSync(outputPath);
                    cleanDownloadsIfNeeded();
                } else {
                    console.error("Error al enviar el archivo:", err);
                    res.status(500).send("Error al enviar el archivo.");
                }
            });
        } else {
            console.error("El archivo de descarga no se generó.");
            res.status(500).send("Error: El archivo no se generó.");
        }
    });
});

// Iniciar el servidor
server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

// Emitir progreso al cliente
io.on("connection", (socket) => {
    console.log("Cliente conectado.");
    socket.on("disconnect", () => {
        console.log("Cliente desconectado.");
    });
});
