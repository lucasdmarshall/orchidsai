"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  User,
  Edit3,
  Trash2,
  Star,
  StarOff,
  Plus,
  MessageSquare,
  Settings,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";

interface Persona {
  id: string;
  name: string;
  personality: string;
  is_default: boolean;
  created_at: string;
}

interface Character {
  id: string;
  name: string;
  title: string;
  greeting: string;
  personality: string;
  avatar_url: string;
  created_at: string;
}

export default function ProfilePage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [personaForm, setPersonaForm] = useState({ name: "", personality: "" });
  const [characterForm, setCharacterForm] = useState({
    name: "",
    title: "",
    greeting: "",
    personality: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const [personasRes, charactersRes] = await Promise.all([
      supabase.from("personas").select("*").order("created_at", { ascending: false }),
      supabase.from("characters").select("*").order("created_at", { ascending: false }),
    ]);
    if (personasRes.data) setPersonas(personasRes.data);
    if (charactersRes.data) setCharacters(charactersRes.data);
    setLoading(false);
  }

  const setDefaultPersona = async (id: string) => {
    await supabase.from("personas").update({ is_default: false }).neq("id", id);
    await supabase.from("personas").update({ is_default: true }).eq("id", id);
    toast.success("Default persona updated!");
    fetchData();
  };

  const deletePersona = async (id: string) => {
    await supabase.from("personas").delete().eq("id", id);
    toast.success("Persona deleted!");
    fetchData();
  };

  const updatePersona = async () => {
    if (!editingPersona) return;
    await supabase
      .from("personas")
      .update({ name: personaForm.name, personality: personaForm.personality })
      .eq("id", editingPersona.id);
    toast.success("Persona updated!");
    setEditingPersona(null);
    fetchData();
  };

  const deleteCharacter = async (id: string) => {
    await supabase.from("characters").delete().eq("id", id);
    toast.success("Character deleted!");
    fetchData();
  };

  const updateCharacter = async () => {
    if (!editingCharacter) return;
    await supabase
      .from("characters")
      .update({
        name: characterForm.name,
        title: characterForm.title,
        greeting: characterForm.greeting,
        personality: characterForm.personality,
      })
      .eq("id", editingCharacter.id);
    toast.success("Character updated!");
    setEditingCharacter(null);
    fetchData();
  };

  const openEditPersona = (persona: Persona) => {
    setEditingPersona(persona);
    setPersonaForm({ name: persona.name, personality: persona.personality || "" });
  };

  const openEditCharacter = (character: Character) => {
    setEditingCharacter(character);
    setCharacterForm({
      name: character.name,
      title: character.title || "",
      greeting: character.greeting || "",
      personality: character.personality || "",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-matcha"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 space-y-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <h1 className="text-4xl font-black tracking-tight flex items-center gap-3">
          <User className="w-10 h-10 text-matcha" />
          My Profile
        </h1>
        <p className="text-zinc-500">Manage your personas and created characters.</p>
      </motion.div>

      {/* Personas Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-matcha" />
            My Personas
          </h2>
          <Link href="/create/persona">
            <Button className="rounded-full bg-matcha hover:bg-matcha-dark text-black gap-2">
              <Plus className="w-4 h-4" />
              New Persona
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence>
            {personas.length === 0 ? (
              <div className="col-span-full text-center py-12 text-zinc-500 bg-zinc-900/50 rounded-[2rem] border border-zinc-800">
                No personas yet. Create one to get started!
              </div>
            ) : (
              personas.map((persona) => (
                <motion.div
                  key={persona.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={`relative p-6 rounded-[2rem] border transition-all ${
                    persona.is_default
                      ? "bg-matcha/10 border-matcha/50"
                      : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  {persona.is_default && (
                    <div className="absolute top-4 right-4 bg-matcha text-black text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                      Default
                    </div>
                  )}
                  <h3 className="text-lg font-bold">{persona.name}</h3>
                  <p className="text-sm text-zinc-500 mt-1 line-clamp-2">
                    {persona.personality || "No personality defined"}
                  </p>

                  <div className="flex items-center gap-2 mt-4">
                    {!persona.is_default && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full text-xs gap-1"
                        onClick={() => setDefaultPersona(persona.id)}
                      >
                        <Star className="w-3 h-3" />
                        Set Default
                      </Button>
                    )}
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-full text-xs gap-1"
                          onClick={() => openEditPersona(persona)}
                        >
                          <Edit3 className="w-3 h-3" />
                          Edit
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="rounded-[2rem] border-zinc-800 bg-zinc-900">
                        <DialogHeader>
                          <DialogTitle>Edit Persona</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                          <div className="space-y-2">
                            <Label>Name</Label>
                            <Input
                              value={personaForm.name}
                              onChange={(e) =>
                                setPersonaForm({ ...personaForm, name: e.target.value })
                              }
                              className="rounded-full bg-zinc-800/50 border-zinc-700"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Personality</Label>
                            <Textarea
                              value={personaForm.personality}
                              onChange={(e) =>
                                setPersonaForm({ ...personaForm, personality: e.target.value })
                              }
                              className="rounded-[1.5rem] bg-zinc-800/50 border-zinc-700 min-h-[100px]"
                            />
                          </div>
                          <DialogClose asChild>
                            <Button
                              onClick={updatePersona}
                              className="w-full rounded-full bg-matcha hover:bg-matcha-dark text-black"
                            >
                              Save Changes
                            </Button>
                          </DialogClose>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-full text-xs gap-1 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-[2rem] border-zinc-800 bg-zinc-900">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Persona?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the persona.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deletePersona(persona.id)}
                            className="rounded-full bg-red-500 hover:bg-red-600"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </motion.section>

      {/* Characters Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="space-y-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-matcha" />
            My Characters
          </h2>
          <Link href="/create/character">
            <Button className="rounded-full bg-matcha hover:bg-matcha-dark text-black gap-2">
              <Plus className="w-4 h-4" />
              New Character
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {characters.length === 0 ? (
              <div className="col-span-full text-center py-12 text-zinc-500 bg-zinc-900/50 rounded-[2rem] border border-zinc-800">
                No characters yet. Create one to get started!
              </div>
            ) : (
              characters.map((character) => (
                <motion.div
                  key={character.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="group relative bg-zinc-900/50 rounded-[2rem] border border-zinc-800 overflow-hidden hover:border-zinc-700 transition-all"
                >
                  <div className="relative aspect-square bg-zinc-800">
                    <Image
                      src={
                        character.avatar_url ||
                        "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400&h=400&auto=format&fit=crop"
                      }
                      alt={character.name}
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 to-transparent" />
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="font-bold text-lg truncate">{character.name}</h3>
                      <p className="text-xs text-matcha truncate">{character.title}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/chat/${character.id}`}>
                        <Button
                          size="sm"
                          className="rounded-full bg-matcha hover:bg-matcha-dark text-black text-xs gap-1"
                        >
                          <MessageSquare className="w-3 h-3" />
                          Chat
                        </Button>
                      </Link>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full text-xs gap-1"
                            onClick={() => openEditCharacter(character)}
                          >
                            <Edit3 className="w-3 h-3" />
                            Edit
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="rounded-[2rem] border-zinc-800 bg-zinc-900 max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Edit Character</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 pt-4">
                            <div className="space-y-2">
                              <Label>Name</Label>
                              <Input
                                value={characterForm.name}
                                onChange={(e) =>
                                  setCharacterForm({ ...characterForm, name: e.target.value })
                                }
                                className="rounded-full bg-zinc-800/50 border-zinc-700"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Title</Label>
                              <Input
                                value={characterForm.title}
                                onChange={(e) =>
                                  setCharacterForm({ ...characterForm, title: e.target.value })
                                }
                                className="rounded-full bg-zinc-800/50 border-zinc-700"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Greeting</Label>
                              <Input
                                value={characterForm.greeting}
                                onChange={(e) =>
                                  setCharacterForm({ ...characterForm, greeting: e.target.value })
                                }
                                className="rounded-full bg-zinc-800/50 border-zinc-700"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Personality</Label>
                              <Textarea
                                value={characterForm.personality}
                                onChange={(e) =>
                                  setCharacterForm({ ...characterForm, personality: e.target.value })
                                }
                                className="rounded-[1.5rem] bg-zinc-800/50 border-zinc-700 min-h-[100px]"
                              />
                            </div>
                            <DialogClose asChild>
                              <Button
                                onClick={updateCharacter}
                                className="w-full rounded-full bg-matcha hover:bg-matcha-dark text-black"
                              >
                                Save Changes
                              </Button>
                            </DialogClose>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full text-xs gap-1 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-[2rem] border-zinc-800 bg-zinc-900">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Character?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will permanently delete the
                              character and all associated chats.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteCharacter(character.id)}
                              className="rounded-full bg-red-500 hover:bg-red-600"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </motion.section>
    </div>
  );
}
