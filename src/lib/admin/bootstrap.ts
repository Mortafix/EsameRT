import { ObjectId } from "mongodb";

import { ApiError } from "@/lib/api";
import {
  codeHint,
  digestCode,
  encryptCode,
  hashCode,
  validateCode,
} from "@/lib/auth/codes";
import { bootstrapDatabase } from "@/lib/db/bootstrap";
import { collections } from "@/lib/db/collections";
import type { UserDocument } from "@/types/domain";

export async function bootstrapFirstAdmin(nameInput: string, codeInput: string) {
  await bootstrapDatabase();
  const { users } = await collections();
  const existing = await users.findOne({ role: "admin", isActive: true });
  if (existing) {
    throw new ApiError(
      409,
      "ADMIN_ALREADY_EXISTS",
      `Un amministratore attivo esiste già (${existing.name}).`,
    );
  }

  const name = nameInput.normalize("NFC").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 100) {
    throw new ApiError(400, "INVALID_NAME", "Il nome deve avere 2–100 caratteri.");
  }
  let normalizedCode: string;
  try {
    normalizedCode = validateCode(codeInput);
  } catch (error) {
    throw new ApiError(
      400,
      "INVALID_CODE",
      error instanceof Error ? error.message : "Codice non valido.",
    );
  }
  const now = new Date();
  const user: UserDocument = {
    _id: new ObjectId(),
    name,
    normalizedName: name.toLocaleLowerCase("it-IT"),
    notes: "Amministratore iniziale",
    role: "admin",
    isActive: true,
    codeDigest: digestCode(normalizedCode),
    codeHash: await hashCode(normalizedCode),
    codeCiphertext: encryptCode(normalizedCode),
    codeHint: codeHint(normalizedCode),
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await users.insertOne(user);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      throw new ApiError(409, "BOOTSTRAP_CONFLICT", "Bootstrap già eseguito.");
    }
    throw error;
  }
  return { id: user._id.toHexString(), name: user.name, role: user.role };
}
