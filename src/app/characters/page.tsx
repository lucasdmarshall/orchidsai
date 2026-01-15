"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Users,
  MoreVertical,
  Pencil,
  Trash2,
  MessageSquare,
  Sparkles,
  Shield,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";

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
  greeting: string;
  personality: string;
  avatar_url: string;
  created_at: string;
  content_rating?: "sfw" | "nsfw";
  tags?: Tag[];
}

const ITEMS_PER_PAGE = 12;

export default function CharactersPage() {
  const router = useRouter();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editCharacter, setEditCharacter] = useState<Character | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [contentFilter, setContentFilter] = useState<"all" | "sfw" | "nsfw">("all");
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
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

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("messages").delete().eq("character_id", deleteId);
    await supabase.from("chats").delete().eq("character_id", deleteId);
    await supabase.from("character_tags").delete().eq("character_id", deleteId);
    await supabase.from("characters").delete().eq("id", deleteId);
    setCharacters(characters.filter((c) => c.id !== deleteId));
    setDeleteId(null);
    toast.success("Character deleted");
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCharacter) return;
    setEditLoading(true);

    const { error } = await supabase
      .from("characters")
      .update({
        name: editCharacter.name,
        title: editCharacter.title,
        greeting: editCharacter.greeting,
        personality: editCharacter.personality,
        content_rating: editCharacter.content_rating || "sfw",
      })
      .eq("id", editCharacter.id);

    if (error) {
      toast.error("Failed to update character");
    } else {
      setCharacters(
        characters.map((c) => (c.id === editCharacter.id ? editCharacter : c))
      );
      toast.success("Character updated");
      setEditCharacter(null);
    }
    setEditLoading(false);
  };

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
    <main className="min-h-screen px-6 py-12 max-w-7xl mx-auto pb-32">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-matcha" />
            <h1 className="text-3xl font-black tracking-tight">Characters</h1>
          </div>
          <Button
            onClick={() => router.push("/create/character")}
            className="rounded-full bg-matcha hover:bg-matcha-dark text-black font-bold gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Character
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-matcha transition-colors w-4 h-4" />
            <Input
              placeholder="Search characters..."
              className="pl-11 h-11 rounded-full bg-zinc-900/50 border-zinc-800 focus:border-matcha focus:ring-matcha transition-all"
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

        <div className="relative">
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

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-400 font-bold uppercase tracking-widest text-sm">
            <Users className="w-4 h-4 text-matcha" />
            {selectedTag ? `${tags.find(t => t.slug === selectedTag)?.name || ""}` : "All"} Characters
          </div>
          {!loading && (
            <span className="text-zinc-500 text-sm">
              {characters.length} of {totalCount} characters
            </span>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] bg-zinc-900 animate-pulse rounded-2xl"
              />
            ))}
          </div>
        ) : characters.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <Users className="w-16 h-16 text-zinc-700 mx-auto" />
            <p className="text-zinc-500 text-lg">No characters found</p>
            <Button
              onClick={() => router.push("/create/character")}
              className="rounded-full bg-matcha hover:bg-matcha-dark text-black"
            >
              Create Your First Character
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            <AnimatePresence mode="popLayout">
              {characters.map((char, index) => (
                <motion.div
                  key={char.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: Math.min(index * 0.03, 0.3) }}
                  whileHover={{ y: -4, scale: 1.02 }}
                  className="group relative bg-zinc-900/80 rounded-2xl overflow-hidden cursor-pointer border border-zinc-800 hover:border-matcha/50 transition-all"
                >
                  <Link href={`/chat/${char.id}`}>
                    <div className="relative aspect-[3/4] overflow-hidden bg-zinc-800">
                      <Image
                        src={char.avatar_url || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400&h=400&auto=format&fit=crop"}
                        alt={char.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      
                      {char.content_rating === "nsfw" && (
                        <div className="absolute top-2 left-2 bg-red-500/90 text-white px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3" />
                          18+
                        </div>
                      )}

                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <h3 className="text-sm font-bold text-white truncate">{char.name}</h3>
                        <p className="text-[11px] text-zinc-400 truncate">{char.title}</p>
                        
                        {char.tags && char.tags.length > 0 && (
                          <div className="flex gap-1 mt-1.5 overflow-hidden">
                            {char.tags.slice(0, 2).map((tag, idx) => (
                              <span
                                key={`${char.id}-${tag.id}-${idx}`}
                                style={{ backgroundColor: `${tag.color}CC` }}
                                className="px-1.5 py-0.5 rounded text-[9px] font-medium text-white"
                              >
                                {tag.name}
                              </span>
                            ))}
                            {char.tags.length > 2 && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-zinc-700/80 text-zinc-300">
                                +{char.tags.length - 2}
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

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute bottom-2 right-2 z-20 rounded-full bg-black/50 hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="bg-zinc-900 border-zinc-800"
                    >
                      <DropdownMenuItem
                        onClick={() => router.push(`/chat/${char.id}`)}
                        className="gap-2"
                      >
                        <MessageSquare className="w-4 h-4" />
                        Chat
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setEditCharacter(char)}
                        className="gap-2"
                      >
                        <Pencil className="w-4 h-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteId(char.id)}
                        className="gap-2 text-red-400 focus:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

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
      </motion.div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Character?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this character and all associated
              chat history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="rounded-full bg-red-500 hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editCharacter} onOpenChange={() => setEditCharacter(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-matcha" />
              Edit Character
            </DialogTitle>
          </DialogHeader>
          {editCharacter && (
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={editCharacter.name}
                  onChange={(e) =>
                    setEditCharacter({ ...editCharacter, name: e.target.value })
                  }
                  className="rounded-full bg-zinc-800/50 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={editCharacter.title}
                  onChange={(e) =>
                    setEditCharacter({ ...editCharacter, title: e.target.value })
                  }
                  className="rounded-full bg-zinc-800/50 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label>Greeting</Label>
                <Input
                  value={editCharacter.greeting}
                  onChange={(e) =>
                    setEditCharacter({
                      ...editCharacter,
                      greeting: e.target.value,
                    })
                  }
                  className="rounded-full bg-zinc-800/50 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label>Personality</Label>
                <Textarea
                  value={editCharacter.personality}
                  onChange={(e) =>
                    setEditCharacter({
                      ...editCharacter,
                      personality: e.target.value,
                    })
                  }
                  className="rounded-2xl bg-zinc-800/50 border-zinc-700 min-h-[100px]"
                />
              </div>
              <div className="space-y-2">
                <Label>Content Rating</Label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setEditCharacter({ ...editCharacter, content_rating: "sfw" })
                    }
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-full font-semibold transition-all",
                      editCharacter.content_rating !== "nsfw"
                        ? "bg-lime-500 text-black"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    )}
                  >
                    <Shield className="w-4 h-4" />
                    SFW
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditCharacter({ ...editCharacter, content_rating: "nsfw" })
                    }
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-full font-semibold transition-all",
                      editCharacter.content_rating === "nsfw"
                        ? "bg-red-500 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    )}
                  >
                    <ShieldAlert className="w-4 h-4" />
                    NSFW
                  </button>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditCharacter(null)}
                  className="rounded-full"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={editLoading}
                  className="rounded-full bg-matcha hover:bg-matcha-dark text-black gap-2"
                >
                  {editLoading ? "Saving..." : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
