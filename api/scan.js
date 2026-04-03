export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { image, mediaType } = req.body;
  if (!image) return res.status(400).json({ error: "No image provided" });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType || "image/jpeg", data: image },
              },
              {
                type: "text",
                text: `Analizá esta imagen de un ticket, factura o captura de pago. Respondé SOLO con un JSON válido, sin texto extra:
{
  "amount": <número sin símbolos, ej: 1500.50>,
  "description": "<descripción corta del comercio o producto, max 40 chars>",
  "date": "<fecha en formato YYYY-MM-DD, o null si no se ve>"
}
Si no podés determinar el monto con certeza, usá null para amount.`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || "";

    // Parse JSON from response
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(200).json({ amount: null, description: "", date: null });

    const parsed = JSON.parse(match[0]);
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: "Error procesando la imagen" });
  }
}