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
import { UserCircle, Zap } from "lucide-react";

export default function CreatePersona() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    personality: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from("personas")
        .insert([formData]);

      if (error) throw error;

      toast.success("Persona created successfully!");
      router.push("/");
    } catch (error) {
      toast.error("Failed to create persona");
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
            <UserCircle className="w-10 h-10 text-matcha" />
            Your Persona
          </h1>
          <p className="text-zinc-500">Define how you want AI characters to perceive you.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 bg-zinc-900/50 p-8 rounded-[3rem] border border-zinc-800 backdrop-blur-sm">
          <div className="space-y-2">
            <Label htmlFor="name">Your Name</Label>
            <Input
              id="name"
              required
              placeholder="How should characters call you?"
              className="rounded-full bg-zinc-800/50 border-zinc-700"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="personality">Your Personality / Background</Label>
            <Textarea
              id="personality"
              required
              placeholder="Describe yourself... (e.g. A space explorer from the year 3000, curious and brave)"
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
            {loading ? "Saving..." : (
              <>
                Save Persona
                <Zap className="w-5 h-5 group-hover:scale-125 transition-transform" />
              </>
            )}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
