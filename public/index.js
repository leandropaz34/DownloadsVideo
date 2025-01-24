const socket = io(); // Conexión con el servidor Socket.IO

// Función para verificar si el enlace tiene un formato válido
function isValidUrl(url) {
    const regex = /^(ftp|http|https):\/\/[^ "]+$/;
    return regex.test(url);
}

// Función para obtener los detalles del video
async function fetchVideoDetails(url) {
    const spinner = document.getElementById("loading-spinner");
    try {
        console.log("Mostrando spinner de carga"); // Log para depuración
        spinner.style.display = "flex"; // Mostrar spinner
        spinner.classList.remove('download'); // Asegurarnos de que no tiene la clase 'download'
        const response = await fetch(`/video-details?url=${encodeURIComponent(url)}`);
        const data = await response.json();

        if (data.error) {
            document.getElementById('response-message').innerText = 'Error al obtener los detalles del video';
            console.log('Error al obtener los detalles del video'); // Log para depuración
            return;
        }

        document.getElementById('thumbnail').src = data.thumbnail;
        document.getElementById('title').innerText = data.title;
        document.getElementById('preview').style.display = 'block';
        console.log('Detalles del video obtenidos y mostrados'); // Log para depuración
    } catch (error) {
        document.getElementById('response-message').innerText = 'Error en la solicitud de previsualización';
        console.log('Error en la solicitud de previsualización', error); // Log para depuración
    } finally {
        spinner.style.display = "none"; // Ocultar spinner
        console.log("Ocultando spinner de carga"); // Log para depuración
    }
}

// Función para descargar el archivo en el formato seleccionado y mostrar la barra de progreso
function downloadFile(format) {
    const url = document.getElementById('video-link').value;
    const downloadUrl = `/download?url=${encodeURIComponent(url)}&format=${format}`;
    const spinner = document.getElementById("loading-spinner");

    // Mostrar spinner y barra de progreso
    spinner.style.display = "flex"; // Mostrar spinner
    spinner.classList.add('download'); // Añadir la clase 'download' para ocultar la leyenda
    const loadingContainer = document.getElementById("loading-container");
    const loadingBar = document.getElementById("loading-bar");
    const loadingText = document.getElementById("loading-text");
    loadingBar.value = 0;
    loadingContainer.style.display = "block";
    loadingText.textContent = "Procesando espere por favor...";

    // Escuchar progreso en tiempo real desde el servidor
    socket.on("progress", (progress) => {
        loadingBar.value = progress;
        loadingText.textContent = `Progreso: ${progress.toFixed(2)}%`;
        console.log(`Progreso: ${progress.toFixed(2)}%`); // Log para depuración
        if (progress === 100) {
            spinner.style.display = "none"; // Ocultar spinner al 100%
        }
    });

    // Redirigir para iniciar la descarga
    window.location.href = downloadUrl;
}

// Manejo del formulario de descarga y previsualización del video
document.getElementById("download-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const link = document.getElementById("video-link").value;
    const responseMessage = document.getElementById("response-message");
    const button = document.querySelector("button");

    responseMessage.textContent = "";

    // Validar enlace
    if (!isValidUrl(link)) {
        responseMessage.style.color = "red";
        responseMessage.textContent = "Por favor, ingresa un enlace válido.";
        return;
    }

    try {
        // Obtener detalles del video para previsualización
        await fetchVideoDetails(link);
        console.log("Se ejecutó la previsualización del video"); // Log para depuración
    } catch (error) {
        responseMessage.style.color = "red";
        responseMessage.textContent = error.message;
        console.log("Error en el manejo del formulario de descarga", error); // Log para depuración
    } finally {
        button.disabled = false;
    }
});

// Funciones para iniciar la descarga en el formato seleccionado
function downloadVideo() {
    downloadFile('mp4');
}

function downloadAudio() {
    downloadFile('mp3');
}

// Manejo del progreso usando Socket.IO
socket.on('progress', (progress) => {
    document.getElementById('loading-bar').value = progress;
    document.getElementById('loading-text').innerText = `Procesando... ${progress}%`;
    console.log(`Actualización de progreso: ${progress}%`); // Log para depuración
});
