"use client";

import { useState, useEffect } from "react";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserCircle, Plus, Pencil, Trash2, Star, StarOff } from "lucide-react";

interface Persona {
  id: string;
  name: string;
  personality: string;
  created_at: string;
  is_default: boolean;
}

export default function PersonaPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    personality: "",
  });

  useEffect(() => {
    fetchPersonas();
  }, []);

  const fetchPersonas = async () => {
    try {
      const { data, error } = await supabase
        .from("personas")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPersonas(data || []);
    } catch (error) {
      toast.error("Failed to load personas");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingPersona(null);
    setFormData({ name: "", personality: "" });
    setModalOpen(true);
  };

  const openEditModal = (persona: Persona) => {
    setEditingPersona(persona);
    setFormData({ name: persona.name, personality: persona.personality });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingPersona) {
        const { error } = await supabase
          .from("personas")
          .update(formData)
          .eq("id", editingPersona.id);

        if (error) throw error;
        toast.success("Persona updated!");
      } else {
        const { error } = await supabase
          .from("personas")
          .insert([formData]);

        if (error) throw error;
        toast.success("Persona created!");
      }

      setModalOpen(false);
      fetchPersonas();
    } catch (error) {
      toast.error(editingPersona ? "Failed to update persona" : "Failed to create persona");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this persona?")) return;

    try {
      const { error } = await supabase
        .from("personas")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Persona deleted!");
      fetchPersonas();
    } catch (error) {
      toast.error("Failed to delete persona");
      console.error(error);
    }
  };

  const handleSetDefault = async (id: string, currentDefault: boolean) => {
    try {
      if (!currentDefault) {
        await supabase
          .from("personas")
          .update({ is_default: false })
          .neq("id", id);
      }

      const { error } = await supabase
        .from("personas")
        .update({ is_default: !currentDefault })
        .eq("id", id);

      if (error) throw error;
      toast.success(currentDefault ? "Default removed" : "Set as default!");
      fetchPersonas();
    } catch (error) {
      toast.error("Failed to update default");
      console.error(error);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-black tracking-tight flex items-center gap-3">
              <UserCircle className="w-10 h-10 text-matcha" />
              Your Personas
            </h1>
            <p className="text-zinc-500">Manage how AI characters perceive you.</p>
          </div>
          <Button
            onClick={openAddModal}
            className="rounded-full bg-matcha hover:bg-matcha-dark text-black font-bold flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Persona
          </Button>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-32 bg-zinc-800/50 rounded-3xl animate-pulse" />
            ))}
          </div>
        ) : personas.length === 0 ? (
          <div className="text-center py-16 bg-zinc-900/50 rounded-[3rem] border border-zinc-800">
            <UserCircle className="w-16 h-16 mx-auto text-zinc-600 mb-4" />
            <p className="text-zinc-500 mb-4">No personas yet</p>
            <Button
              onClick={openAddModal}
              className="rounded-full bg-matcha hover:bg-matcha-dark text-black font-bold"
            >
              Create Your First Persona
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {personas.map((persona) => (
                <motion.div
                  key={persona.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`p-6 rounded-3xl border backdrop-blur-sm transition-all ${
                    persona.is_default
                      ? "bg-matcha/10 border-matcha/30"
                      : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-xl font-bold truncate">{persona.name}</h3>
                        {persona.is_default && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-matcha/20 text-matcha rounded-full">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-zinc-400 text-sm line-clamp-3">
                        {persona.personality}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleSetDefault(persona.id, persona.is_default)}
                        className={`rounded-full ${
                          persona.is_default ? "text-matcha" : "text-zinc-500 hover:text-matcha"
                        }`}
                        title={persona.is_default ? "Remove default" : "Set as default"}
                      >
                        {persona.is_default ? (
                          <Star className="w-5 h-5 fill-current" />
                        ) : (
                          <StarOff className="w-5 h-5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditModal(persona)}
                        className="rounded-full text-zinc-500 hover:text-white"
                      >
                        <Pencil className="w-5 h-5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(persona.id)}
                        className="rounded-full text-zinc-500 hover:text-red-500"
                      >
                        <Trash2 className="w-5 h-5" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-3xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {editingPersona ? "Edit Persona" : "Add Persona"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="modal-name">Your Name</Label>
              <Input
                id="modal-name"
                required
                placeholder="How should characters call you?"
                className="rounded-full bg-zinc-800/50 border-zinc-700"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="modal-personality">Your Personality / Background</Label>
              <Textarea
                id="modal-personality"
                required
                placeholder="Describe yourself..."
                className="rounded-2xl bg-zinc-800/50 border-zinc-700 min-h-[120px]"
                value={formData.personality}
                onChange={(e) => setFormData({ ...formData, personality: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setModalOpen(false)}
                className="rounded-full"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="rounded-full bg-matcha hover:bg-matcha-dark text-black font-bold"
              >
                {saving ? "Saving..." : editingPersona ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
