"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles, UserPlus } from "lucide-react";

export default function CreateCharacter() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    title: "",
    greeting: "",
    personality: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from("characters")
        .insert([
          {
            ...formData,
            avatar_url: `https://images.unsplash.com/photo-1614728263952-84ea256f9679?q=80&w=400&h=400&auto=format&fit=crop`,
          },
        ]);

      if (error) throw error;

      toast.success("Character created successfully!");
      router.push("/");
    } catch (error) {
      toast.error("Failed to create character");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div className="space-y-2">
          <h1 className="text-4xl font-black tracking-tight flex items-center gap-3">
            <UserPlus className="w-10 h-10 text-matcha" />
            Create Character
          </h1>
          <p className="text-zinc-500">Design your own AI companion with a unique personality.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 bg-zinc-900/50 p-8 rounded-[3rem] border border-zinc-800 backdrop-blur-sm">
          <div className="space-y-2">
            <Label htmlFor="name">Character Name</Label>
            <Input
              id="name"
              required
              placeholder="e.g. Sherlock Holmes"
              className="rounded-full bg-zinc-800/50 border-zinc-700"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title / Short Description</Label>
            <Input
              id="title"
              required
              placeholder="e.g. The World's Greatest Detective"
              className="rounded-full bg-zinc-800/50 border-zinc-700"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="greeting">Greeting Message</Label>
            <Input
              id="greeting"
              required
              placeholder="e.g. The game is afoot! How can I help you today?"
              className="rounded-full bg-zinc-800/50 border-zinc-700"
              value={formData.greeting}
              onChange={(e) => setFormData({ ...formData, greeting: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="personality">Personality Traits</Label>
            <Textarea
              id="personality"
              required
              placeholder="Describe how the character should behave, their interests, and speech patterns..."
              className="rounded-[2rem] bg-zinc-800/50 border-zinc-700 min-h-[150px]"
              value={formData.personality}
              onChange={(e) => setFormData({ ...formData, personality: e.target.value })}
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-14 rounded-full bg-matcha hover:bg-matcha-dark text-black font-bold text-lg flex items-center gap-2 group transition-all"
          >
            {loading ? "Creating..." : (
              <>
                Bring to Life
                <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
              </>
            )}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
