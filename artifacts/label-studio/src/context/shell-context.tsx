import { createContext, useContext, useState, ReactNode } from "react";

type TopBarState = {
  title?: string;
  actions?: ReactNode;
};

type ShellContextType = {
  topBarState: TopBarState;
  setTopBarState: (s: TopBarState) => void;
};

export const ShellContext = createContext<ShellContextType>({
  topBarState: {},
  setTopBarState: () => {},
});

export function useShell() {
  return useContext(ShellContext);
}
