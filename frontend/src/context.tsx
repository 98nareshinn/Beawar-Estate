import { createContext, useContext } from "react";
import type { PublicData, Workspace, User, Page } from "./types";
export interface EstateContext {
  data: PublicData;
  user: User | null;
  workspace: Workspace;
  setUser: (u: User | null) => void;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  page: Page;
  navigate: (p: Page) => void;
  signIn: () => void;
  can: (p: string) => boolean;
  openProperty: (id: string) => void;
  newProperty: () => void;
}
export const Estate = createContext<EstateContext>(null!);
export const useEstate = () => useContext(Estate);
