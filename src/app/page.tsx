"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { CharacterCard } from "@/components/CharacterCard";
import { Input } from "@/components/ui/input";
import { Search, Sparkles, TrendingUp, Shield, ShieldAlert, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Tag {
  id: string;
  name: string;
  color: string;
  slug: string;
  type: string;
}

interface Character {
  id: string;
  name: string;
  title: string;
  avatar_url: string;
  content_rating: "sfw" | "nsfw";
  tags?: Tag[];
}

const ITEMS_PER_PAGE = 12;

export default function Home() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [contentFilter, setContentFilter] = useState<"all" | "sfw" | "nsfw">("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  
  const tagsContainerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchTags() {
      const { data } = await supabase
        .from("tags")
        .select("*")
        .neq("type", "content_rating")
        .order("name");
      if (data) setTags(data);
    }
    fetchTags();
  }, []);

  const fetchCharacters = useCallback(async (pageNum: number, reset: boolean = false) => {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    let query = supabase
      .from("characters")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(pageNum * ITEMS_PER_PAGE, (pageNum + 1) * ITEMS_PER_PAGE - 1);

    if (contentFilter !== "all") {
      query = query.eq("content_rating", contentFilter);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,title.ilike.%${search}%`);
    }

    const { data: chars, count } = await query;

    if (chars) {
      const { data: characterTags } = await supabase
        .from("character_tags")
        .select("character_id, tags(id, name, color, slug, type)")
        .in("character_id", chars.map((c) => c.id));

      const tagsByCharacter = new Map<string, Tag[]>();
      characterTags?.forEach((ct: { character_id: string; tags: Tag }) => {
        const existing = tagsByCharacter.get(ct.character_id) || [];
        if (ct.tags) existing.push(ct.tags);
        tagsByCharacter.set(ct.character_id, existing);
      });

      let enrichedChars = chars.map((char) => ({
        ...char,
        tags: tagsByCharacter.get(char.id) || [],
      }));

      if (selectedTag) {
        enrichedChars = enrichedChars.filter(char => 
          char.tags?.some(t => t.slug === selectedTag)
        );
      }

      if (reset) {
        setCharacters(enrichedChars);
      } else {
        setCharacters(prev => [...prev, ...enrichedChars]);
      }

      setTotalCount(count || 0);
      setHasMore(chars.length === ITEMS_PER_PAGE);
    }

    setLoading(false);
    setLoadingMore(false);
  }, [contentFilter, search, selectedTag]);

  useEffect(() => {
    setPage(0);
    fetchCharacters(0, true);
  }, [contentFilter, search, selectedTag, fetchCharacters]);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          setPage(prev => {
            const newPage = prev + 1;
            fetchCharacters(newPage, false);
            return newPage;
          });
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [hasMore, loading, loadingMore, fetchCharacters]);

  const scrollTags = (direction: "left" | "right") => {
    if (tagsContainerRef.current) {
      const scrollAmount = 200;
      tagsContainerRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth"
      });
    }
  };

  return (
    <main className="min-h-screen px-6 py-12 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
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
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-center max-w-4xl mx-auto">
          <div className="relative flex-1 w-full group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-matcha transition-colors" />
            <Input
              placeholder="Search characters..."
              className="pl-12 h-12 rounded-full bg-zinc-900/50 border-zinc-800 focus:border-matcha focus:ring-matcha transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex bg-zinc-900/50 rounded-full p-1 border border-zinc-800">
            <button
              onClick={() => setContentFilter("all")}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium transition-all",
                contentFilter === "all"
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-white"
              )}
            >
              All
            </button>
            <button
              onClick={() => setContentFilter("sfw")}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-1.5",
                contentFilter === "sfw"
                  ? "bg-lime-500 text-black"
                  : "text-zinc-400 hover:text-white"
              )}
            >
              <Shield className="w-3.5 h-3.5" />
              SFW
            </button>
            <button
              onClick={() => setContentFilter("nsfw")}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-1.5",
                contentFilter === "nsfw"
                  ? "bg-red-500 text-white"
                  : "text-zinc-400 hover:text-white"
              )}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              NSFW
            </button>
          </div>
        </div>

        <div className="relative max-w-4xl mx-auto">
          <button
            onClick={() => scrollTags("left")}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-zinc-900/90 hover:bg-zinc-800 p-1.5 rounded-full border border-zinc-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <div 
            ref={tagsContainerRef}
            className="flex gap-2 overflow-x-auto scrollbar-hide px-8 py-2"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <button
              onClick={() => setSelectedTag(null)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all border",
                !selectedTag
                  ? "bg-matcha text-black border-matcha"
                  : "bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:border-zinc-600"
              )}
            >
              All Tags
            </button>
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => setSelectedTag(selectedTag === tag.slug ? null : tag.slug)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all border",
                  selectedTag === tag.slug
                    ? "text-white border-transparent"
                    : "bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:border-zinc-600"
                )}
                style={selectedTag === tag.slug ? { backgroundColor: tag.color } : {}}
              >
                {tag.name}
              </button>
            ))}
          </div>

          <button
            onClick={() => scrollTags("right")}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-zinc-900/90 hover:bg-zinc-800 p-1.5 rounded-full border border-zinc-700 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-zinc-400 font-bold uppercase tracking-widest text-sm">
              <TrendingUp className="w-4 h-4 text-matcha" />
              {selectedTag ? `${tags.find(t => t.slug === selectedTag)?.name || ""}` : "Featured"} Characters
            </div>
            {!loading && (
              <span className="text-zinc-500 text-sm">
                {characters.length} of {totalCount} characters
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            <AnimatePresence mode="popLayout">
              {loading ? (
                Array.from({ length: 12 }).map((_, i) => (
                  <motion.div
                    key={`skeleton-${i}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="aspect-[3/4] bg-zinc-900 animate-pulse rounded-2xl"
                  />
                ))
              ) : characters.length > 0 ? (
                characters.map((char, index) => (
                  <motion.div
                    key={char.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: Math.min(index * 0.03, 0.3) }}
                  >
                    <CharacterCard
                      id={char.id}
                      name={char.name}
                      title={char.title}
                      avatar_url={char.avatar_url}
                      content_rating={char.content_rating}
                      tags={char.tags}
                    />
                  </motion.div>
                ))
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="col-span-full text-center py-20 text-zinc-500"
                >
                  No characters found matching your criteria.
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {hasMore && !loading && (
            <div ref={loadMoreRef} className="flex justify-center py-8">
              {loadingMore && (
                <div className="flex items-center gap-2 text-zinc-500">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading more...
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </main>
  );
}
