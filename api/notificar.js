// api/notificar.js - Función serverless de Vercel
// Envía una notificación push al destinatario de una carta usando FCM

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

// Inicializar Firebase Admin (solo una vez)
if (!getApps().length) {
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}

const db = getFirestore();
const messaging = getMessaging();

export default async function handler(req, res) {
    // Solo aceptar POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { destinatarioUid, titulo, cuerpo, urlCarta } = req.body;

    if (!destinatarioUid || !titulo || !cuerpo) {
        return res.status(400).json({ error: 'Faltan parámetros' });
    }

    try {
        // Buscar el token FCM del destinatario en Firestore
        const tokenDoc = await db.collection('tokens').doc(destinatarioUid).get();
        
        if (!tokenDoc.exists) {
            return res.status(404).json({ error: 'Destinatario sin token registrado' });
        }

        const { fcmToken } = tokenDoc.data();
        if (!fcmToken) {
            return res.status(404).json({ error: 'Token FCM no encontrado' });
        }

        // Enviar notificación push vía FCM
        const mensaje = {
            token: fcmToken,
            notification: {
                title: titulo,
                body: cuerpo,
            },
            webpush: {
                fcmOptions: {
                    link: urlCarta || 'https://tu-app.vercel.app',
                },
            },
        };

        const response = await messaging.send(mensaje);
        
        return res.status(200).json({ 
            success: true, 
            messageId: response 
        });

    } catch (error) {
        console.error('Error enviando notificación:', error);
        
        // Si el token es inválido, eliminarlo de Firestore
        if (error.code === 'messaging/registration-token-not-registered') {
            await db.collection('tokens').doc(destinatarioUid).delete();
        }
        
        return res.status(500).json({ 
            error: 'Error al enviar notificación',
            detalle: error.message 
        });
    }
}
