"use client";

import { motion } from "framer-motion";
import { MessageSquare, ShieldAlert } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface CharacterCardProps {
  id: string;
  name: string;
  title: string;
  avatar_url: string;
  content_rating?: "sfw" | "nsfw";
  tags?: Tag[];
}

export function CharacterCard({ id, name, title, avatar_url, content_rating, tags }: CharacterCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.02 }}
      className="group relative bg-zinc-900/80 rounded-2xl overflow-hidden cursor-pointer border border-zinc-800 hover:border-matcha/50 transition-all"
    >
      <Link href={`/chat/${id}`}>
        <div className="relative aspect-[3/4] overflow-hidden bg-zinc-800">
          <Image
            src={avatar_url || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400&h=400&auto=format&fit=crop"}
            alt={name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          
          {content_rating === "nsfw" && (
            <div className="absolute top-2 left-2 bg-red-500/90 text-white px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" />
              18+
            </div>
          )}

          <div className="absolute bottom-0 left-0 right-0 p-3">
            <h3 className="text-sm font-bold text-white truncate">{name}</h3>
            <p className="text-[11px] text-zinc-400 truncate">{title}</p>
            
            {tags && tags.length > 0 && (
              <div className="flex gap-1 mt-1.5 overflow-hidden">
                {tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag.id}
                    style={{ backgroundColor: `${tag.color}CC` }}
                    className="px-1.5 py-0.5 rounded text-[9px] font-medium text-white"
                  >
                    {tag.name}
                  </span>
                ))}
                {tags.length > 2 && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-zinc-700/80 text-zinc-300">
                    +{tags.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="absolute top-2 right-2 bg-matcha text-black p-2 rounded-full opacity-0 group-hover:opacity-100 transform scale-75 group-hover:scale-100 transition-all shadow-lg">
            <MessageSquare className="w-4 h-4" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
