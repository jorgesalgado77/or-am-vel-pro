/**
 * useModuleDrag — Drag & collision logic for parametric 3D modules.
 * Extracted from ParametricEditor to reduce component size.
 */

import { useCallback, useRef } from "react";
import { snapToGrid } from "@/lib/spanEngine";
import type { ParametricModule } from "@/types/parametricModule";

interface DuplicatedModule {
  id: string;
  module: ParametricModule;
  positionX: number;
  positionZ: number;
}

interface WallConfig {
  enabled: boolean;
  width: number;
  height: number;
  depth: number;
  color: string;
}

interface DragState {
  id: string;
  startX: number;
  startY: number;
  mouseX: number;
  mouseY: number;
  isMain?: boolean;
}

interface UseModuleDragOptions {
  module: ParametricModule;
  duplicates: DuplicatedModule[];
  wall: WallConfig;
  moduleOffsetX: number;
  moduleOffsetY: number;
  lockPosition: boolean;
  groupSelect: boolean;
  collisionEnabled: boolean;
  computedFloorOffset: number;
  selectedModuleId: string | null;
  threeRef: React.MutableRefObject<any>;
  updatePersisted: (partial: Record<string, unknown>) => void;
}

export function useModuleDrag({
  module, duplicates, wall, moduleOffsetX, moduleOffsetY,
  lockPosition, groupSelect, collisionEnabled, computedFloorOffset,
  selectedModuleId, threeRef, updatePersisted,
}: UseModuleDragOptions) {
  const dragRef = useRef<DragState | null>(null);
  const isDraggingRef = useRef(false);

  const SNAP_THRESHOLD = 30;

  const magneticSnap = (val: number, targets: number[]): number => {
    for (const t of targets) {
      if (Math.abs(val - t) <= SNAP_THRESHOLD) return t;
    }
    return val;
  };

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if (!threeRef.current) return;
    const { THREE, camera, renderer, moduleGroups } = threeRef.current;
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const findHitModule = (): string | null => {
      const taggedGroups = moduleGroups.filter((g: any) => g.userData?.moduleId);
      const sorted = taggedGroups.sort((a: any, b: any) => {
        if (a.userData.moduleId === "__main__") return 1;
        if (b.userData.moduleId === "__main__") return -1;
        return 0;
      });
      for (const grp of sorted) {
        const intersects = raycaster.intersectObjects(grp.children, true);
        if (intersects.length > 0) return grp.userData.moduleId;
      }
      return null;
    };

    const hitId = findHitModule();

    if (hitId) {
      updatePersisted({ selectedModuleId: hitId });

      if (!lockPosition) {
        if (hitId === "__main__") {
          if (groupSelect) {
            dragRef.current = { id: "__group__", startX: moduleOffsetX, startY: moduleOffsetY, mouseX: e.clientX, mouseY: e.clientY, isMain: true };
          } else {
            dragRef.current = { id: "__main__", startX: moduleOffsetX, startY: moduleOffsetY, mouseX: e.clientX, mouseY: e.clientY, isMain: true };
          }
        } else {
          const dup = duplicates.find((d) => d.id === hitId);
          if (dup) {
            if (groupSelect) {
              dragRef.current = { id: "__group__", startX: moduleOffsetX, startY: moduleOffsetY, mouseX: e.clientX, mouseY: e.clientY, isMain: true };
            } else {
              dragRef.current = { id: dup.id, startX: dup.positionX, startY: dup.positionZ, mouseX: e.clientX, mouseY: e.clientY };
            }
          }
        }
        isDraggingRef.current = false;
        threeRef.current.controls.enabled = false;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }
    } else {
      updatePersisted({ selectedModuleId: null });
    }
  }, [duplicates, moduleOffsetX, moduleOffsetY, lockPosition, groupSelect, updatePersisted, threeRef]);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !threeRef.current) return;
    const dx = e.clientX - dragRef.current.mouseX;
    const dy = e.clientY - dragRef.current.mouseY;
    const threshold = 8;
    if (!isDraggingRef.current && Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
    isDraggingRef.current = true;
    const scale = 5;

    if (dragRef.current.id === "__group__") {
      const deltaX = snapToGrid(dx * scale);
      const deltaY = snapToGrid(-dy * scale);
      let newMainX = dragRef.current.startX + deltaX;
      let newMainY = dragRef.current.startY + deltaY;

      if (wall.enabled) {
        const halfWall = wall.width / 2;
        const halfMod = module.width / 2;
        const minX = -halfWall + halfMod;
        const maxX = halfWall - halfMod;
        newMainX = Math.max(minX, Math.min(maxX, newMainX));
        newMainY = Math.max(0, Math.min(wall.height - module.height - computedFloorOffset, newMainY));
      }

      const actualDeltaX = newMainX - moduleOffsetX;
      const newDups = duplicates.map((d) => ({
        ...d,
        positionX: d.positionX + actualDeltaX,
      }));
      updatePersisted({ moduleOffsetX: newMainX, moduleOffsetY: newMainY, duplicates: newDups });
    } else if (dragRef.current.isMain) {
      let newX = snapToGrid(dragRef.current.startX + dx * scale);
      let newY = snapToGrid(dragRef.current.startY - dy * scale);

      if (wall.enabled) {
        const halfWall = wall.width / 2;
        const halfMod = module.width / 2;
        const minX = -halfWall + halfMod;
        const maxX = halfWall - halfMod;
        const snapTargetsX = [minX, 0, maxX];
        const snapTargetsY = [0, wall.height - module.height - computedFloorOffset];
        newX = magneticSnap(newX, snapTargetsX);
        newY = magneticSnap(newY, snapTargetsY);
        newX = Math.max(minX, Math.min(maxX, newX));
        newY = Math.max(0, Math.min(wall.height - module.height - computedFloorOffset, newY));
      }

      // Collision detection with duplicates
      if (collisionEnabled && wall.enabled) {
        const mainHalfW = module.width / 2;
        const mainHalfH = module.height / 2;
        const mainCenterY = newY + computedFloorOffset + module.height / 2;

        for (const d of duplicates) {
          const dupAbsX = d.positionX + newX;
          const dupHalfW = d.module.width / 2;
          const dupHalfH = d.module.height / 2;
          const dupFloor = computedFloorOffset;
          const dupCenterY = (d.positionZ || 0) + dupFloor + d.module.height / 2;

          const overlapX = (newX + mainHalfW > dupAbsX - dupHalfW) && (newX - mainHalfW < dupAbsX + dupHalfW);
          const overlapY = (mainCenterY + mainHalfH > dupCenterY - dupHalfH) && (mainCenterY - mainHalfH < dupCenterY + dupHalfH);

          if (overlapX && overlapY) {
            const dupAbsCurrent = d.positionX + moduleOffsetX;
            const pushL = dupAbsCurrent - dupHalfW - mainHalfW;
            const pushR = dupAbsCurrent + dupHalfW + mainHalfW;
            newX = Math.abs(newX - pushL) < Math.abs(newX - pushR) ? pushL : pushR;
          }
        }
        const halfWall = wall.width / 2;
        const halfMod = module.width / 2;
        newX = Math.max(-halfWall + halfMod, Math.min(halfWall - halfMod, newX));
      }

      updatePersisted({ moduleOffsetX: newX, moduleOffsetY: newY });
    } else {
      let newX = snapToGrid(dragRef.current.startX + dx * scale);
      const newZ = snapToGrid(dragRef.current.startY + dy * scale);
      const dragDup = duplicates.find((d) => d.id === dragRef.current!.id);
      const dragW = dragDup?.module.width || module.width;

      if (wall.enabled) {
        const mainRight = moduleOffsetX + module.width / 2;
        const mainLeft = moduleOffsetX - module.width / 2;
        const snapTargetsX: number[] = [];
        duplicates.forEach((d) => {
          if (d.id !== dragRef.current!.id) {
            snapTargetsX.push(d.positionX + d.module.width + 3);
            snapTargetsX.push(d.positionX - dragW - 3);
          }
        });
        snapTargetsX.push(mainRight + 3, mainLeft - dragW - 3);
        newX = magneticSnap(newX, snapTargetsX);

        if (collisionEnabled) {
          const halfWall = wall.width / 2;
          const absX = newX + moduleOffsetX;
          const dupHalf = dragW / 2;
          const clampedAbs = Math.max(-halfWall + dupHalf, Math.min(halfWall - dupHalf, absX));
          newX = clampedAbs - moduleOffsetX;
        }
      }

      // Collision with main module and other duplicates
      if (collisionEnabled) {
        let absX = newX + moduleOffsetX;
        const dragHalfW = dragW / 2;

        // Check against main module
        const mainCX = moduleOffsetX;
        const mainHalfW = module.width / 2;
        const overlapX_main = (absX + dragHalfW > mainCX - mainHalfW) && (absX - dragHalfW < mainCX + mainHalfW);
        if (overlapX_main) {
          const pushLeft = mainCX - mainHalfW - dragHalfW;
          const pushRight = mainCX + mainHalfW + dragHalfW;
          absX = Math.abs(absX - pushLeft) < Math.abs(absX - pushRight) ? pushLeft : pushRight;
        }

        // Check against other duplicates (two passes)
        for (let pass = 0; pass < 2; pass++) {
          for (const d of duplicates) {
            if (d.id === dragRef.current!.id) continue;
            const dAbsX = d.positionX + moduleOffsetX;
            const dHalfW = d.module.width / 2;
            if (absX + dragHalfW > dAbsX - dHalfW && absX - dragHalfW < dAbsX + dHalfW) {
              const pushLeft = dAbsX - dHalfW - dragHalfW;
              const pushRight = dAbsX + dHalfW + dragHalfW;
              absX = Math.abs(absX - pushLeft) < Math.abs(absX - pushRight) ? pushLeft : pushRight;
            }
          }
        }
        // Re-check main after duplicate adjustments
        if (absX + dragHalfW > mainCX - mainHalfW && absX - dragHalfW < mainCX + mainHalfW) {
          const pushLeft = mainCX - mainHalfW - dragHalfW;
          const pushRight = mainCX + mainHalfW + dragHalfW;
          absX = Math.abs(absX - pushLeft) < Math.abs(absX - pushRight) ? pushLeft : pushRight;
        }

        newX = absX - moduleOffsetX;

        if (wall.enabled) {
          const halfWall = wall.width / 2;
          const finalAbs = newX + moduleOffsetX;
          const clampedAbs = Math.max(-halfWall + dragHalfW, Math.min(halfWall - dragHalfW, finalAbs));
          newX = clampedAbs - moduleOffsetX;
        }
      }

      const newDups = duplicates.map((d) =>
        d.id === dragRef.current!.id ? { ...d, positionX: newX, positionZ: newZ } : d
      );
      updatePersisted({ duplicates: newDups });
    }
  }, [duplicates, updatePersisted, wall, module.width, module.height, computedFloorOffset, moduleOffsetX, collisionEnabled, threeRef]);

  const handleCanvasPointerUp = useCallback(() => {
    if (dragRef.current && threeRef.current) {
      threeRef.current.controls.enabled = true;
    }
    dragRef.current = null;
    isDraggingRef.current = false;
  }, [threeRef]);

  return {
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
    dragRef,
    isDraggingRef,
  };
}
