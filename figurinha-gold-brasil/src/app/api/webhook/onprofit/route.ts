import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb } from "pdf-lib";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { sendAlert } from "@/lib/alert";
import { createHash } from "crypto";

const FB_PIXEL_ID = process.env.FB_PIXEL_ID || "";

async function sendFbPurchaseEvent(email: string, stickerId: string, transactionId: string) {
  const accessToken = process.env.FB_CAPI_ACCESS_TOKEN;
  if (!accessToken || !FB_PIXEL_ID) return;

  const emailHash = createHash("sha256").update(email.toLowerCase().trim()).digest("hex");

  const body: Record<string, unknown> = {
    data: [{
      event_name: "Purchase",
      event_time: Math.floor(Date.now() / 1000),
      action_source: "website",
      user_data: { em: [emailHash] },
      custom_data: {
        value: 12.90,
        currency: "BRL",
        content_ids: [stickerId],
        content_type: "product",
        order_id: transactionId,
      },
    }],
  };
  if (process.env.FB_TEST_EVENT_CODE) body.test_event_code = process.env.FB_TEST_EVENT_CODE;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${FB_PIXEL_ID}/events?access_token=${accessToken}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    const result = await res.json() as Record<string, unknown>;
    console.log("FB CAPI Purchase:", JSON.stringify(result));
  } catch (err) {
    console.error("FB CAPI erro:", err instanceof Error ? err.message : err);
  }
}

export const maxDuration = 300;

const CELL_W_CM = 4.9;
const CELL_H_CM = 6.5;
const A4_W_CM = 21;
const A4_H_CM = 29.7;
const CM_TO_PT = 28.3465;

const CELL_W = CELL_W_CM * CM_TO_PT;
const CELL_H = CELL_H_CM * CM_TO_PT;
const A4_W = A4_W_CM * CM_TO_PT;
const A4_H = A4_H_CM * CM_TO_PT;
const COLS = 4;
const ROWS = 4;

async function generatePDF(stickerBytes: Uint8Array): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  let stickerImage;
  try {
    stickerImage = await pdf.embedPng(stickerBytes);
  } catch {
    stickerImage = await pdf.embedJpg(stickerBytes);
  }

  const imgRatio = stickerImage.width / stickerImage.height;
  const cellRatio = CELL_W / CELL_H;
  let drawW: number, drawH: number, offsetX: number, offsetY: number;
  if (imgRatio < cellRatio) {
    drawH = CELL_H;
    drawW = CELL_H * imgRatio;
    offsetX = (CELL_W - drawW) / 2;
    offsetY = 0;
  } else {
    drawW = CELL_W;
    drawH = CELL_W / imgRatio;
    offsetX = 0;
    offsetY = (CELL_H - drawH) / 2;
  }

  const page = pdf.addPage([A4_W, A4_H]);
  const gridW = COLS * CELL_W;
  const gridH = ROWS * CELL_H;
  const marginX = (A4_W - gridW) / 2;
  const marginY = (A4_H - gridH) / 2;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cellX = marginX + col * CELL_W;
      const cellY = A4_H - marginY - (row + 1) * CELL_H;
      page.drawImage(stickerImage, { x: cellX + offsetX, y: cellY + offsetY, width: drawW, height: drawH });
    }
  }

  const gray = rgb(0.5, 0.5, 0.5);
  const MARK = 10;
  for (let row = 0; row <= ROWS; row++) {
    const y = A4_H - marginY - row * CELL_H;
    page.drawLine({ start: { x: marginX - MARK, y }, end: { x: marginX, y }, thickness: 0.5, color: gray });
    page.drawLine({ start: { x: marginX + gridW, y }, end: { x: marginX + gridW + MARK, y }, thickness: 0.5, color: gray });
  }
  for (let col = 0; col <= COLS; col++) {
    const x = marginX + col * CELL_W;
    page.drawLine({ start: { x, y: A4_H - marginY }, end: { x, y: A4_H - marginY + MARK }, thickness: 0.5, color: gray });
    page.drawLine({ start: { x, y: A4_H - marginY - gridH - MARK }, end: { x, y: A4_H - marginY - gridH }, thickness: 0.5, color: gray });
  }

  return Buffer.from(await pdf.save());
}

// Extrai campos do payload OnProfit tentando múltiplos caminhos possíveis
function extractFromPayload(payload: Record<string, unknown>) {
  // OnProfit pode mandar em diferentes formatos dependendo da versão
  // Logamos tudo para facilitar debug
  console.log("OnProfit payload completo:", JSON.stringify(payload, null, 2));

  const event = (
    payload.event ||
    payload.type ||
    payload.status ||
    (payload.data as Record<string, unknown>)?.status
  ) as string;

  // Customer/buyer pode estar em diferentes chaves
  const customer = (
    payload.customer ||
    payload.buyer ||
    payload.subscriber ||
    (payload.data as Record<string, unknown>)?.buyer ||
    (payload.data as Record<string, unknown>)?.customer ||
    {}
  ) as Record<string, unknown>;

  const customerEmail = (
    customer.email ||
    payload.email ||
    (payload.data as Record<string, unknown>)?.email
  ) as string;

  const customerName = (
    customer.name ||
    customer.full_name ||
    payload.name ||
    (payload.data as Record<string, unknown>)?.name ||
    ""
  ) as string;

  // Transaction/order ID
  const transactionId = (
    payload.order_id ||
    payload.transaction_id ||
    payload.id ||
    (payload.order as Record<string, unknown>)?.id ||
    (payload.data as Record<string, unknown>)?.order_id ||
    (payload.data as Record<string, unknown>)?.transaction ||
    ""
  ) as string;

  // sticker_id passado via UTM src ou tracking
  const tracking = (
    payload.tracking ||
    payload.metadata ||
    payload.utm ||
    (payload.data as Record<string, unknown>)?.tracking ||
    {}
  ) as Record<string, unknown>;

  const stickerId = (
    tracking.src ||
    tracking.utm_source ||
    tracking.source ||
    payload.src ||
    payload.utm_source ||
    null
  ) as string | null;

  return { event, customerEmail, customerName, transactionId, stickerId };
}

function isApprovedEvent(event: string): boolean {
  if (!event) return false;
  const ev = event.toLowerCase();
  return (
    ev.includes("approved") ||
    ev.includes("complete") ||
    ev.includes("paid") ||
    ev === "purchase_approved" ||
    ev === "aprovado" ||
    ev === "pago"
  );
}

export async function POST(req: NextRequest) {
  // Validação opcional de token OnProfit
  const onprofitToken = process.env.ONPROFIT_TOKEN;
  if (onprofitToken) {
    const receivedToken =
      req.headers.get("x-onprofit-token") ||
      req.headers.get("authorization")?.replace("Bearer ", "") ||
      new URL(req.url).searchParams.get("token");
    if (receivedToken !== onprofitToken) {
      console.warn("Webhook OnProfit: token inválido recebido:", receivedToken);
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { event, customerEmail, customerName, transactionId, stickerId } = extractFromPayload(payload);

  console.log(`OnProfit webhook - event: ${event}, email: ${customerEmail}, transaction: ${transactionId}`);

  if (!isApprovedEvent(event)) {
    console.log(`Evento ignorado: ${event}`);
    return NextResponse.json({ ok: true, message: "Evento ignorado" });
  }

  if (!customerEmail) {
    console.error("Webhook OnProfit sem email do comprador");
    await sendAlert(
      "WEBHOOK SEM EMAIL",
      `OnProfit: pagamento sem email!\nPayload: ${JSON.stringify(payload).substring(0, 300)}`
    ).catch(() => {});
    return NextResponse.json({ error: "Email não encontrado" }, { status: 400 });
  }

  const sql = getDb();

  // Idempotência
  const idempotencyKey = `onprofit-${transactionId || customerEmail}-${event}`;
  const alreadyProcessed = await sql`
    SELECT 1 FROM webhook_processed WHERE idempotency_key = ${idempotencyKey}
  `.catch(() => []);
  if (alreadyProcessed.length > 0) {
    console.log(`Webhook duplicado ignorado: ${idempotencyKey}`);
    return NextResponse.json({ ok: true, message: "Já processado" });
  }
  await sql`
    INSERT INTO webhook_processed (idempotency_key) VALUES (${idempotencyKey}) ON CONFLICT DO NOTHING
  `.catch(() => {});

  // Buscar figurinha pelo sticker_id ou último pedido pendente do email
  let stickerUrl: string | null = null;
  let resolvedStickerId: string | null = stickerId;

  if (stickerId) {
    const rows = await sql`
      SELECT sticker_id, sticker_url FROM pedidos
      WHERE sticker_id = ${stickerId} AND sticker_url IS NOT NULL
      LIMIT 1
    `;
    if (rows.length > 0) stickerUrl = rows[0].sticker_url;
  }

  if (!stickerUrl) {
    const rows = await sql`
      SELECT sticker_id, sticker_url FROM pedidos
      WHERE email = ${customerEmail} AND sticker_url IS NOT NULL AND status = 'pendente'
      ORDER BY created_at DESC LIMIT 1
    `;
    if (rows.length === 0) {
      // Fallback: qualquer pedido nas últimas 2h
      const rows2 = await sql`
        SELECT sticker_id, sticker_url FROM pedidos
        WHERE email = ${customerEmail} AND sticker_url IS NOT NULL
          AND created_at > NOW() - INTERVAL '2 hours'
        ORDER BY created_at DESC LIMIT 1
      `;
      if (rows2.length > 0) {
        stickerUrl = rows2[0].sticker_url;
        resolvedStickerId = rows2[0].sticker_id;
      }
    } else {
      stickerUrl = rows[0].sticker_url;
      resolvedStickerId = rows[0].sticker_id;
    }
    if (stickerUrl) console.log(`Fallback: usando pedido ${resolvedStickerId}`);
  }

  if (!stickerUrl) {
    console.error("Figurinha não encontrada para", customerEmail);
    await sendAlert(
      "FIGURINHA NÃO ENCONTRADA",
      `Pagamento OnProfit recebido mas figurinha não encontrada!\nCliente: ${customerName} (${customerEmail})\nSticker ID: ${stickerId || "nenhum"}\nTransação: ${transactionId}`
    ).catch(() => {});
    return NextResponse.json({ error: "Figurinha não encontrada" }, { status: 404 });
  }

  try {
    const stickerRes = await fetch(stickerUrl);
    const stickerBytes = new Uint8Array(await stickerRes.arrayBuffer());

    console.log(`Gerando PDF para ${customerName} (${customerEmail})...`);
    const pdfBuffer = await generatePDF(stickerBytes);
    console.log(`PDF gerado: ${Math.round(pdfBuffer.length / 1024)} KB`);

    const pdfBlob = await put(`pdfs/${resolvedStickerId}.pdf`, pdfBuffer, {
      access: "public",
      contentType: "application/pdf",
      allowOverwrite: true,
    });

    await sql`
      UPDATE pedidos
      SET status = 'pago', email = ${customerEmail}, pdf_url = ${pdfBlob.url}, paid_at = NOW()
      WHERE sticker_id = ${resolvedStickerId}
    `;

    await sql`
      INSERT INTO sorteo_entries (pedido_id, email, nome, sticker_id, multiplicador)
      SELECT id, ${customerEmail}, ${customerName}, ${resolvedStickerId}, 1
      FROM pedidos WHERE sticker_id = ${resolvedStickerId}
    `.catch((e) => console.error("Erro ao registrar sorteio:", e));

    console.log(`Enviando email para ${customerEmail}...`);
    const emailEnviado = await sendEmail(customerEmail, customerName, stickerBytes, pdfBuffer, pdfBlob.url);

    if (!emailEnviado) {
      await sendAlert(
        "FALHA ENVIO EMAIL",
        `Nenhum método de email funcionou!\nCliente: ${customerName} (${customerEmail})\nPedido: ${resolvedStickerId}`
      ).catch(() => {});
    }

    await sendFbPurchaseEvent(customerEmail, resolvedStickerId!, transactionId).catch(() => {});

    await sql`
      UPDATE pedidos
      SET status = ${emailEnviado ? "entregado" : "pago"}, delivered_at = ${emailEnviado ? new Date().toISOString() : null}
      WHERE sticker_id = ${resolvedStickerId}
    `;

    return NextResponse.json({ ok: true, message: "Figurinha enviada por email" });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Erro no webhook OnProfit:", errMsg);
    await sendAlert(
      "ERRO WEBHOOK ONPROFIT",
      `Erro ao processar pagamento!\nCliente: ${customerName} (${customerEmail})\nErro: ${errMsg.substring(0, 200)}`
    ).catch(() => {});
    return NextResponse.json({ error: "Erro ao processar: " + errMsg }, { status: 500 });
  }
}
