import { PrismaClient } from "@prisma/client";

let prisma;

if (typeof window === "undefined") {
  // Only run on server side
  if (process.env.NODE_ENV !== "production") {
    if (!global.prismaGlobal) {
      global.prismaGlobal = new PrismaClient();
    }
    prisma = global.prismaGlobal;
  } else {
    prisma = new PrismaClient();
  }
} else {
  // Throw error if trying to use on client side
  throw new Error("PrismaClient should not be used on the client side");
}

export default prisma;
export { prisma as db };
