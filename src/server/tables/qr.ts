import QRCode from "qrcode";
import { env } from "@/server/env";
import { tableOrderUrl } from "./service";

export const orderUrlFor = (qrToken: string) => tableOrderUrl(env().BETTER_AUTH_URL, qrToken);

/** High-resolution PNG (print quality). Error correction "Q" survives scuffed table cards. */
export function qrPng(qrToken: string, width = 1200): Promise<Buffer> {
  return QRCode.toBuffer(orderUrlFor(qrToken), { type: "png", width, margin: 2, errorCorrectionLevel: "Q" });
}

export function qrSvg(qrToken: string): Promise<string> {
  return QRCode.toString(orderUrlFor(qrToken), { type: "svg", margin: 2, errorCorrectionLevel: "Q" });
}
