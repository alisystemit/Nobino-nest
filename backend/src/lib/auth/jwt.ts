import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export type JwtPayload = {
  sub: string; // userId
  phone: string;
  role: string;
};

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      sub: payload.sub as string,
      phone: payload.phone as string,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}
