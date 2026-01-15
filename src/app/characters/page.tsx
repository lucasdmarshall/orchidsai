"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
} from "lucide-react";
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
  greeting: string;
  personality: string;
  avatar_url: string;
  created_at: string;
  content_rating?: "sfw" | "nsfw";
  tags?: Tag[];
}

export default function CharactersPage() {
  const router = useRouter();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editCharacter, setEditCharacter] = useState<Character | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [contentFilter, setContentFilter] = useState<"all" | "sfw" | "nsfw">("all");
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const tagsContainerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    fetchCharacters();
  }, []);

  const fetchCharacters = async () => {
    const { data: chars } = await supabase
      .from("characters")
      .select("*")
      .order("created_at", { ascending: false });

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

      const enrichedChars = chars.map((char) => ({
        ...char,
        tags: tagsByCharacter.get(char.id) || [],
      }));

      setCharacters(enrichedChars);
    }
    setLoading(false);
  };

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

  const filteredCharacters = characters.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.title.toLowerCase().includes(search.toLowerCase());

    const matchesContent =
      contentFilter === "all" ||
      (contentFilter === "sfw" && c.content_rating !== "nsfw") ||
      (contentFilter === "nsfw" && c.content_rating === "nsfw");

    const matchesTag =
      !selectedTag || c.tags?.some((t) => t.slug === selectedTag);

    return matchesSearch && matchesContent && matchesTag;
  });

  return (
    <main className="min-h-screen px-6 py-12 max-w-6xl mx-auto pb-32">
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

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-32 bg-zinc-900 animate-pulse rounded-2xl"
              />
            ))}
          </div>
        ) : filteredCharacters.length === 0 ? (
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {filteredCharacters.map((char, index) => (
                <motion.div
                  key={char.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.05 }}
                  className="group relative bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 hover:border-matcha/50 transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className="relative">
                      <Avatar className="w-14 h-14 ring-2 ring-zinc-800">
                        <AvatarImage src={char.avatar_url} />
                        <AvatarFallback className="bg-zinc-800 text-lg">
                          {char.name[0]}
                        </AvatarFallback>
                      </Avatar>
                      {char.content_rating === "nsfw" && (
                        <div className="absolute -top-1 -right-1 bg-red-500 text-white px-1 py-0.5 rounded text-[8px] font-bold">
                          18+
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-white truncate">
                        {char.name}
                      </h3>
                      <p className="text-xs text-zinc-500 truncate">
                        {char.title}
                      </p>
                      <p className="text-xs text-zinc-600 mt-2 line-clamp-2">
                        {char.personality}
                      </p>
                      {char.tags && char.tags.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {char.tags.slice(0, 3).map((tag, idx) => (
                            <span
                              key={`${char.id}-${tag.id}-${idx}`}
                              style={{ backgroundColor: `${tag.color}CC` }}
                              className="px-1.5 py-0.5 rounded text-[9px] font-medium text-white"
                            >
                              {tag.name}
                            </span>
                          ))}
                          {char.tags.length > 3 && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-zinc-700/80 text-zinc-300">
                              +{char.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="relative z-10 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
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
                  </div>

                  <div
                    onClick={() => router.push(`/chat/${char.id}`)}
                    className="absolute inset-0 cursor-pointer rounded-2xl z-0"
                  />
                </motion.div>
              ))}
            </AnimatePresence>
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
