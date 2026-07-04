import { MenuItem } from "../menu-item";

/** Left sidebar: media library tabs only (properties live in PropertyInspector). */
export const ControlItem = () => {
  return (
    <div className="hidden h-full w-full flex-none overflow-hidden bg-[#f8fafc] lg:block">
      <MenuItem />
    </div>
  );
};
