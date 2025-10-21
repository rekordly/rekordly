
import { DefaultSession } from "next-auth";


export interface SessionUser {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    onboarded: boolean;
    hasPassword: boolean;
    emailVerified: boolean;
  }
}

export interface MenuItem {
  name: string;
  href: string;
}


export type SessionFlowProps = SessionUser;


