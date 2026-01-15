"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlusCircle, MessageSquare, User, Home, UserCircle, Users, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export function Navigation() {
  const pathname = usePathname();

const navItems = [
    { icon: Home, label: "Home", href: "/" },
    { icon: MessageSquare, label: "Chats", href: "/chats" },
    { icon: Users, label: "Characters", href: "/characters" },
    { icon: User, label: "Persona", href: "/create/persona" },
    { icon: Settings, label: "Settings", href: "/settings" },
  ];

  return (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-xl border border-white/10 px-6 py-3 rounded-full flex items-center gap-8 z-50">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-1 transition-all",
              isActive ? "text-matcha scale-110" : "text-white/60 hover:text-white"
            )}
          >
            <item.icon className="w-5 h-5" />
            <span className="text-[10px] font-medium uppercase tracking-wider">{item.label}</span>
            {isActive && (
              <motion.div
                layoutId="nav-glow"
                className="absolute -inset-2 bg-matcha/20 blur-xl rounded-full -z-10"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
