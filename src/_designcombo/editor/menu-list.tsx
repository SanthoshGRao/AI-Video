import { memo, useCallback } from "react";
import useLayoutStore from "./store/use-layout-store";
import { Icons } from "@/_designcombo/shared/icons";
import { cn } from "@/lib/utils";
import { useIsLargeScreen } from "@/_designcombo/hooks/use-media-query";
import { Layers, Library } from "lucide-react";
import type { IMenuItem } from "./interfaces/layout";

// Define menu items configuration for better maintainability
const MENU_ITEMS = [
  {
    id: "uploads",
    icon: Icons.upload,
    label: "Uploads",
    ariaLabel: "Add and manage uploads"
  },
  {
    id: "library",
    icon: Library,
    label: "Library",
    ariaLabel: "Global media library"
  },
  {
    id: "layers",
    icon: Layers,
    label: "Layers",
    ariaLabel: "Manage timeline layers"
  },
  {
    id: "videos",
    icon: Icons.video,
    label: "Video",
    ariaLabel: "Add and manage video content"
  },
  {
    id: "images",
    icon: Icons.image,
    label: "Photos",
    ariaLabel: "Add and manage images"
  },
  {
    id: "audio",
    icon: Icons.audio,
    label: "Audio",
    ariaLabel: "Add and manage audio content"
  },
  {
    id: "transitions",
    icon: Icons.transition,
    label: "Transitions",
    ariaLabel: "Add transition effects"
  },
  {
    id: "ai-voice",
    icon: Icons.volume,
    label: "Voice",
    ariaLabel: "Generate AI voice from text"
  },
  {
    id: "sfx",
    icon: Icons.sfx,
    label: "SFX",
    ariaLabel: "Generate SFX from text"
  }
] as const;

// Memoized menu button component for better performance
const MenuButton = memo<{
  item: (typeof MENU_ITEMS)[number];
  isActive: boolean;
  onClick: (menuItem: string) => void;
}>(({ item, isActive, onClick }) => {
  const handleClick = useCallback(() => {
    onClick(item.id);
  }, [item.id, onClick]);

  const IconComponent = item.icon;

  return (
    <div
      data-testid={`sidebar-${item.id}-btn`}
      onClick={handleClick}
      className={cn(
        "flex min-h-[58px] w-full cursor-pointer flex-col items-center justify-center rounded-xl px-1 py-2 transition-all duration-200",
        isActive
          ? "bg-white text-[#7d2ae8] shadow-sm font-semibold"
          : "text-white/70 hover:bg-white/10 hover:text-white"
      )}
      key={item.id}
    >
      <IconComponent width={22} height={22} className="mb-1" />
      <span className="text-center text-[10px] font-semibold leading-tight">{item.label}</span>
    </div>
  );
});

MenuButton.displayName = "MenuButton";

// Main MenuList component
function MenuList() {
  const {
    setActiveMenuItem,
    setShowMenuItem,
    activeMenuItem,
    showMenuItem,
    drawerOpen,
    setDrawerOpen
  } = useLayoutStore();

  const isLargeScreen = useIsLargeScreen();

  const handleMenuItemClick = useCallback(
    (menuItem: string) => {
      setActiveMenuItem(menuItem as IMenuItem);
      // Use drawer on mobile, sidebar on desktop
      if (!isLargeScreen) {
        setDrawerOpen(true);
      } else {
        setShowMenuItem(true);
      }
    },
    [isLargeScreen, setActiveMenuItem, setDrawerOpen, setShowMenuItem]
  );

  return (
    <div className="relative flex h-full w-[76px] shrink-0 flex-col items-center overflow-y-auto border-r border-white/10 bg-[#111827] px-2 py-3 text-white scrollbar-hidden">

      <div className="flex w-full flex-col items-center gap-1.5">
        {MENU_ITEMS.map((item) => {
          const isActive =
            (drawerOpen && activeMenuItem === item.id) ||
            (showMenuItem && activeMenuItem === item.id);
          return (
            <MenuButton
              key={item.id}
              item={item}
              isActive={isActive}
              onClick={handleMenuItemClick}
            />
          );
        })}
      </div>
    </div>
  );
}

export default memo(MenuList);
