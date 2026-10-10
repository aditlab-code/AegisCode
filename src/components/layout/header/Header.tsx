import { WindowControls } from "./WindowControls";
import { AppMenu } from "./AppMenu";
import { GlobalSearchButton } from "./GlobalSearchButton";
import { HeaderActions } from "./HeaderActions";

export function Header() {
  return (
    <header className="header">
      <div className="flex items-center gap-4">
        <WindowControls />
        <AppMenu />
      </div>
      <GlobalSearchButton />
      <HeaderActions />
    </header>
  );
}
