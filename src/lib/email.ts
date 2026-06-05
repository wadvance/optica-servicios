import emailjs from "@emailjs/browser";

const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

export async function sendRegistrationEmail(email: string) {
  if (!serviceId || !templateId || !publicKey) return;

  try {
    await emailjs.send(
      serviceId,
      templateId,
      {
        email,
        date: new Date().toLocaleDateString("es-PA", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        message: `Nuevo usuario registrado en el sistema óptico: ${email}`,
      },
      publicKey,
    );
  } catch {
    // Email notification is optional; silently ignore failures
  }
}
