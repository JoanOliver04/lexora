export type PwaRegistration = "starting" | "ready" | "unavailable";
export interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let status: PwaRegistration = "starting";
let prompt: InstallPrompt | null = null;
let installed = false;
const listeners = new Set<() => void>();
export const getRegistration = () => status;
export const getServerRegistration = (): PwaRegistration => "starting";
export const getInstallPrompt = () => prompt;
export const getServerInstallPrompt = () => null;
export const getReportedInstallation = () => installed;
export const getServerReportedInstallation = () => false;
export function setInstallPrompt(value: InstallPrompt | null) {
  prompt = value;
  for (const listener of listeners) listener();
}
export function reportInstallation() {
  installed = true;
  prompt = null;
  for (const listener of listeners) listener();
}
export function subscribeRegistration(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function setRegistration(next: PwaRegistration) {
  status = next;
  for (const listener of listeners) listener();
}
