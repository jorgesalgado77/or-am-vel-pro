import { useEffect, useState } from "react";

interface DealRoomWatermarkProps {
  storeName: string;
  storePhone: string;
}

export function DealRoomWatermark({ storeName, storePhone }: DealRoomWatermarkProps) {
  const [position, setPosition] = useState({ x: 20, y: 20 });

  useEffect(() => {
    const interval = setInterval(() => {
      setPosition({
        x: Math.random() * 60 + 10, // 10% to 70%
        y: Math.random() * 60 + 10,
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="absolute pointer-events-none z-50 select-none transition-all duration-[3000ms] ease-in-out"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: "rotate(-15deg)",
      }}
    >
      <div className="bg-white/10 backdrop-blur-[1px] rounded px-3 py-1.5 border border-white/10">
        <p className="text-white/40 text-sm font-bold whitespace-nowrap">{storeName}</p>
        <p className="text-white/30 text-[10px] whitespace-nowrap">{storePhone}</p>
      </div>
    </div>
  );
}
