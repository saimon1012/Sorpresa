// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyCKlEyQXSpjnos0Nq4ZSicOQm0TvEmxV8w",
    authDomain: "cartas-8ea04.firebaseapp.com",
    projectId: "cartas-8ea04",
    storageBucket: "cartas-8ea04.firebasestorage.app",
    messagingSenderId: "663895466574",
    appId: "1:663895466574:web:7533015ad2b1282e24191f"
});

const messaging = firebase.messaging();

// Manejar notificaciones en segundo plano
messaging.onBackgroundMessage((payload) => {
    console.log('Notificación en segundo plano:', payload);
    const { title, body } = payload.notification;
    const link = payload.fcmOptions?.link || '/';

    self.registration.showNotification(title, {
        body: body,
        icon: '/icon-192.png', // opcional, pon un icono si tienes
        data: { link: link }
    });
});

// Abrir la URL de la carta al hacer clic en la notificación
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const link = event.notification.data?.link || '/';
    event.waitUntil(clients.openWindow(link));
});
