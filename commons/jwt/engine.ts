import type { JwtPayload } from "./jwt.ts";

export const isValid = (jwt: JwtPayload): boolean => {
  const { iss, sub, exp } = jwt;
  if (!iss || !sub) {
    return false;
  }
  if (exp && new Date(exp) <= new Date()) {
    return false;
  }
  return true;
};
