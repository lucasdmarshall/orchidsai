"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles, UserPlus, Shield, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface Tag {
  id: string;
  name: string;
  slug: string;
  type: string;
  color: string;
}

export default function CreateCharacter() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [contentRating, setContentRating] = useState<"sfw" | "nsfw">("sfw");
  const [formData, setFormData] = useState({
    name: "",
    title: "",
    greeting: "",
    personality: "",
    scenario: "",
    example_dialogue: "",
  });

  useEffect(() => {
    async function fetchTags() {
      const { data } = await supabase
        .from("tags")
        .select("*")
        .neq("type", "content_rating")
        .order("type", { ascending: true });
      if (data) setTags(data);
    }
    fetchTags();
  }, []);

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: character, error } = await supabase
        .from("characters")
        .insert([
          {
            ...formData,
            content_rating: contentRating,
            avatar_url: `https://images.unsplash.com/photo-1614728263952-84ea256f9679?q=80&w=400&h=400&auto=format&fit=crop`,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      if (selectedTags.length > 0 && character) {
        const tagInserts = selectedTags.map((tagId) => ({
          character_id: character.id,
          tag_id: tagId,
        }));
        await supabase.from("character_tags").insert(tagInserts);
      }

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

          <div className="space-y-2">
            <Label htmlFor="scenario">Scenario (Optional)</Label>
            <Textarea
              id="scenario"
              placeholder="Describe the setting or situation where the roleplay takes place. e.g. 'You find yourself in a dimly lit Victorian parlor...'"
              className="rounded-[2rem] bg-zinc-800/50 border-zinc-700 min-h-[100px]"
              value={formData.scenario}
              onChange={(e) => setFormData({ ...formData, scenario: e.target.value })}
            />
          </div>

            <div className="space-y-2">
              <Label htmlFor="example_dialogue">Example Dialogue (Optional)</Label>
              <Textarea
                id="example_dialogue"
                placeholder="Show how the character speaks. Use *actions* and &quot;dialogue&quot;. e.g.:
*adjusts monocle* &quot;Fascinating... tell me more.&quot;"
                className="rounded-[2rem] bg-zinc-800/50 border-zinc-700 min-h-[120px] font-mono text-sm"
                value={formData.example_dialogue}
                onChange={(e) => setFormData({ ...formData, example_dialogue: e.target.value })}
              />
            </div>

            <div className="space-y-3">
              <Label>Content Rating</Label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setContentRating("sfw")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-full font-semibold transition-all",
                    contentRating === "sfw"
                      ? "bg-lime-500 text-black"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  )}
                >
                  <Shield className="w-4 h-4" />
                  SFW
                </button>
                <button
                  type="button"
                  onClick={() => setContentRating("nsfw")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-full font-semibold transition-all",
                    contentRating === "nsfw"
                      ? "bg-red-500 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  )}
                >
                  <ShieldAlert className="w-4 h-4" />
                  NSFW
                </button>
              </div>
            </div>

            {tags.length > 0 && (
              <div className="space-y-3">
                <Label>Tags (Optional)</Label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      style={{
                        backgroundColor: selectedTags.includes(tag.id) ? tag.color : undefined,
                        borderColor: tag.color,
                      }}
                      className={cn(
                        "px-4 py-2 rounded-full text-sm font-medium border-2 transition-all",
                        selectedTags.includes(tag.id)
                          ? "text-white"
                          : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700"
                      )}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

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
