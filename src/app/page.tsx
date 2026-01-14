"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { CharacterCard } from "@/components/CharacterCard";
import { Input } from "@/components/ui/input";
import { Search, Sparkles, TrendingUp } from "lucide-react";

export default function Home() {
  const [characters, setCharacters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchCharacters() {
      const { data, error } = await supabase
        .from("characters")
        .select("*")
        .order("created_at", { ascending: false });

      if (data) setCharacters(data);
      setLoading(false);
    }
    fetchCharacters();
  }, []);

  const filteredCharacters = characters.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="min-h-screen px-6 py-12 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-12"
      >
        {/* Hero Section */}
        <div className="text-center space-y-6">
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 5 }}
            className="inline-block"
          >
            <Sparkles className="w-12 h-12 text-matcha" />
          </motion.div>
          <h1 className="text-6xl font-black tracking-tighter">
            Chat with <span className="text-matcha italic">Anyone.</span>
          </h1>
          <p className="text-zinc-500 text-lg max-w-2xl mx-auto">
            Discover thousands of AI characters, each with their own personality, memory, and style. 
            Or create your own unique companion.
          </p>

          <div className="relative max-w-xl mx-auto group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-matcha transition-colors" />
            <Input
              placeholder="Search characters, personalities, or titles..."
              className="pl-12 h-14 rounded-full bg-zinc-900/50 border-zinc-800 focus:border-matcha focus:ring-matcha transition-all text-lg"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Categories / Trending */}
        <div className="space-y-8">
          <div className="flex items-center gap-2 text-zinc-400 font-bold uppercase tracking-widest text-sm">
            <TrendingUp className="w-4 h-4 text-matcha" />
            Featured Characters
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-64 bg-zinc-900 animate-pulse rounded-[2.5rem]" />
              ))
            ) : filteredCharacters.length > 0 ? (
              filteredCharacters.map((char) => (
                <CharacterCard
                  key={char.id}
                  id={char.id}
                  name={char.name}
                  title={char.title}
                  avatar_url={char.avatar_url}
                />
              ))
            ) : (
              <div className="col-span-full text-center py-20 text-zinc-500">
                No characters found matching your search.
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </main>
  );
}
