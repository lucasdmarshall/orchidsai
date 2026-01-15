"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";

interface Character {
  id: string;
  name: string;
  title: string;
  greeting: string;
  personality: string;
  avatar_url: string;
  created_at: string;
}

export default function CharactersPage() {
  const router = useRouter();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editCharacter, setEditCharacter] = useState<Character | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    fetchCharacters();
  }, []);

  const fetchCharacters = async () => {
    const { data } = await supabase
      .from("characters")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setCharacters(data);
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("messages").delete().eq("character_id", deleteId);
    await supabase.from("chats").delete().eq("character_id", deleteId);
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

  const filteredCharacters = characters.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.title.toLowerCase().includes(search.toLowerCase())
  );

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

        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
          <Input
            placeholder="Search characters..."
            className="pl-11 rounded-full bg-zinc-900/50 border-zinc-800"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
            <p className="text-zinc-500 text-lg">No characters yet</p>
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
                    <Avatar className="w-14 h-14 ring-2 ring-zinc-800">
                      <AvatarImage src={char.avatar_url} />
                      <AvatarFallback className="bg-zinc-800 text-lg">
                        {char.name[0]}
                      </AvatarFallback>
                    </Avatar>

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
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
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
