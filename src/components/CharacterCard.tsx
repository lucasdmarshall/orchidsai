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
      whileHover={{ y: -5, scale: 1.02 }}
      className="group relative bg-white dark:bg-zinc-900 rounded-[2.5rem] p-4 border border-zinc-200 dark:border-zinc-800 overflow-hidden cursor-pointer shadow-lg hover:shadow-matcha/20 transition-all"
    >
      <Link href={`/chat/${id}`}>
        <div className="relative aspect-square rounded-[2rem] overflow-hidden mb-4 bg-zinc-100 dark:bg-zinc-800">
          <Image
            src={avatar_url || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400&h=400&auto=format&fit=crop"}
            alt={name}
            fill
            className="object-cover group-hover:scale-110 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          
          {content_rating === "nsfw" && (
            <div className="absolute top-2 left-2 bg-red-500/90 text-white px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" />
              NSFW
            </div>
          )}
        </div>
        
        <div className="space-y-2">
          <h3 className="text-lg font-bold truncate group-hover:text-matcha transition-colors">{name}</h3>
          <p className="text-xs text-zinc-500 truncate">{title}</p>
          
          {tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 3).map((tag) => (
                <span
                  key={tag.id}
                  style={{ backgroundColor: tag.color }}
                  className="px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                >
                  {tag.name}
                </span>
              ))}
              {tags.length > 3 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-700 text-zinc-300">
                  +{tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="absolute bottom-4 right-4 bg-matcha text-black p-3 rounded-full opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all shadow-xl">
          <MessageSquare className="w-5 h-5" />
        </div>
      </Link>
    </motion.div>
  );
}
