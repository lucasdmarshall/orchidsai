"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
    Settings,
    Brain,
    ImageIcon,
    Plus,
    Trash2,
    ChevronLeft,
    Save,
    Sparkles,
    Shield,
    ShieldOff,
} from "lucide-react";
import Link from "next/link";
import { DEFAULT_MODELS, ModelConfig, DEFAULT_SFW_SYSTEM_PROMPT, DEFAULT_NSFW_SYSTEM_PROMPT } from "@/lib/constants";

interface SettingsData {
    sfwSystemPrompt: string;
    nsfwSystemPrompt: string;
    maxTokens: number;
    models: ModelConfig[];
}

export default function SettingsPage() {
    const [settings, setSettings] = useState<SettingsData>({
        sfwSystemPrompt: DEFAULT_SFW_SYSTEM_PROMPT,
        nsfwSystemPrompt: DEFAULT_NSFW_SYSTEM_PROMPT,
        maxTokens: 512,
        models: DEFAULT_MODELS,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [newModel, setNewModel] = useState({
        id: "",
        name: "",
        supportsThinking: false,
        supportsImage: false,
    });
    const [maxTokensInput, setMaxTokensInput] = useState("512");

    const [hasChanges, setHasChanges] = useState(false);
    const [initialLoad, setInitialLoad] = useState(true);

    useEffect(() => {
        const saved = localStorage.getItem("orchids_settings");
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                const loadedSettings = {
                    sfwSystemPrompt: parsed.sfwSystemPrompt || parsed.systemPrompt || DEFAULT_SFW_SYSTEM_PROMPT,
                    nsfwSystemPrompt: parsed.nsfwSystemPrompt || DEFAULT_NSFW_SYSTEM_PROMPT,
                    maxTokens: parsed.maxTokens || 512,
                    models: parsed.models || DEFAULT_MODELS,
                };
                setSettings(loadedSettings);
                setMaxTokensInput(String(loadedSettings.maxTokens));
            } catch {
                setSettings({ sfwSystemPrompt: DEFAULT_SFW_SYSTEM_PROMPT, nsfwSystemPrompt: DEFAULT_NSFW_SYSTEM_PROMPT, maxTokens: 512, models: DEFAULT_MODELS });
                setMaxTokensInput("512");
            }
        } else {
            setSettings({ sfwSystemPrompt: DEFAULT_SFW_SYSTEM_PROMPT, nsfwSystemPrompt: DEFAULT_NSFW_SYSTEM_PROMPT, maxTokens: 512, models: DEFAULT_MODELS });
            setMaxTokensInput("512");
        }
        setLoading(false);
        setTimeout(() => setInitialLoad(false), 100);
    }, []);

    useEffect(() => {
        if (initialLoad || loading) return;
        
        setHasChanges(true);
        const timeout = setTimeout(() => {
            localStorage.setItem("orchids_settings", JSON.stringify(settings));
            setHasChanges(false);
        }, 500);

        return () => clearTimeout(timeout);
    }, [settings, initialLoad, loading]);

    const handleMaxTokensChange = (value: string) => {
        setMaxTokensInput(value);
        const num = parseInt(value);
        if (!isNaN(num) && num >= 64 && num <= 4096) {
            setSettings({ ...settings, maxTokens: num });
        }
    };

    const handleMaxTokensBlur = () => {
        const num = parseInt(maxTokensInput);
        if (isNaN(num) || num < 64) {
            setMaxTokensInput("64");
            setSettings({ ...settings, maxTokens: 64 });
        } else if (num > 4096) {
            setMaxTokensInput("4096");
            setSettings({ ...settings, maxTokens: 4096 });
        }
    };

    const saveSettings = () => {
        setSaving(true);
        localStorage.setItem("orchids_settings", JSON.stringify(settings));
        setHasChanges(false);
        setTimeout(() => {
            setSaving(false);
            toast.success("Settings saved!");
        }, 300);
    };

    const addModel = () => {
        if (!newModel.id || !newModel.name) {
            toast.error("Please fill in all fields");
            return;
        }
        setSettings({
            ...settings,
            models: [...settings.models, { ...newModel }],
        });
        setNewModel({ id: "", name: "", supportsThinking: false, supportsImage: false });
        toast.success("Model added!");
    };

    const removeModel = (modelId: string) => {
        setSettings({
            ...settings,
            models: settings.models.filter((m) => m.id !== modelId),
        });
        toast.success("Model removed!");
    };

    const toggleModelThinking = (modelId: string) => {
        setSettings({
            ...settings,
            models: settings.models.map((m) =>
                m.id === modelId ? { ...m, supportsThinking: !m.supportsThinking } : m
            ),
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
        <div className="min-h-screen bg-black text-white">
            <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between"
                >
                    <div className="flex items-center gap-4">
                        <Link href="/profile">
                            <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10">
                                <ChevronLeft className="w-6 h-6" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2">
                                <Settings className="w-6 h-6 text-matcha" />
                                Settings
                            </h1>
                            <p className="text-sm text-zinc-500">Configure your AI experience</p>
                        </div>
                    </div>
                    <Button
                        onClick={saveSettings}
                        disabled={saving}
                        className={`rounded-full gap-2 ${hasChanges ? "bg-yellow-500 hover:bg-yellow-600" : "bg-matcha hover:bg-matcha-dark"} text-black`}
                    >
                        <Save className="w-4 h-4" />
                        {saving ? "Saving..." : hasChanges ? "Unsaved" : "Saved"}
                    </Button>
                </motion.div>

                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-4"
                >
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-matcha" />
                        <Label className="text-lg font-semibold">System Prompts</Label>
                    </div>
                    <p className="text-xs text-zinc-500">
                        SFW prompt is used for characters without NSFW tag. NSFW prompt is used for characters with NSFW tag.
                    </p>
                    
                    <Tabs defaultValue="sfw" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 bg-zinc-900/50 rounded-full p-1">
                            <TabsTrigger value="sfw" className="rounded-full data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400 gap-2">
                                <Shield className="w-4 h-4" />
                                SFW
                            </TabsTrigger>
                            <TabsTrigger value="nsfw" className="rounded-full data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400 gap-2">
                                <ShieldOff className="w-4 h-4" />
                                NSFW
                            </TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="sfw" className="space-y-3 mt-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-green-400 flex items-center gap-2">
                                    <Shield className="w-4 h-4" />
                                    Safe For Work Prompt
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSettings({ ...settings, sfwSystemPrompt: DEFAULT_SFW_SYSTEM_PROMPT })}
                                    className="text-xs text-zinc-500 hover:text-matcha"
                                >
                                    Reset to Default
                                </Button>
                            </div>
                            <Textarea
                                value={settings.sfwSystemPrompt}
                                onChange={(e) => setSettings({ ...settings, sfwSystemPrompt: e.target.value })}
                                placeholder="Enter SFW system prompt..."
                                className="min-h-[200px] rounded-2xl bg-zinc-900/50 border-zinc-800 focus:border-green-500 font-mono text-sm"
                            />
                        </TabsContent>
                        
                        <TabsContent value="nsfw" className="space-y-3 mt-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-red-400 flex items-center gap-2">
                                    <ShieldOff className="w-4 h-4" />
                                    Not Safe For Work Prompt
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSettings({ ...settings, nsfwSystemPrompt: DEFAULT_NSFW_SYSTEM_PROMPT })}
                                    className="text-xs text-zinc-500 hover:text-matcha"
                                >
                                    Reset to Default
                                </Button>
                            </div>
                            <Textarea
                                value={settings.nsfwSystemPrompt}
                                onChange={(e) => setSettings({ ...settings, nsfwSystemPrompt: e.target.value })}
                                placeholder="Enter NSFW system prompt..."
                                className="min-h-[200px] rounded-2xl bg-zinc-900/50 border-zinc-800 focus:border-red-500 font-mono text-sm"
                            />
                        </TabsContent>
                    </Tabs>
                    
                    <p className="text-xs text-zinc-600">
                        Use {"{{char}}"} for character name and {"{{user}}"} for user name placeholders.
                    </p>
                </motion.section>

                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="space-y-4"
                >
                    <Label className="text-lg font-semibold">Max Token Limit</Label>
                    <div className="flex items-center gap-4">
                        <Input
                            type="text"
                            inputMode="numeric"
                            value={maxTokensInput}
                            onChange={(e) => handleMaxTokensChange(e.target.value)}
                            onBlur={handleMaxTokensBlur}
                            className="w-32 rounded-full bg-zinc-900/50 border-zinc-800 focus:border-matcha"
                        />
                        <span className="text-sm text-zinc-500">tokens (64 - 4096)</span>
                    </div>
                </motion.section>

                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-4"
                >
                    <div className="flex items-center justify-between">
                        <Label className="text-lg font-semibold">Model Manager</Label>
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button size="sm" className="rounded-full bg-matcha hover:bg-matcha-dark text-black gap-1">
                                    <Plus className="w-4 h-4" />
                                    Add Model
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="rounded-[2rem] border-zinc-800 bg-zinc-900">
                                <DialogHeader>
                                    <DialogTitle>Add New Model</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 pt-4">
                                    <div className="space-y-2">
                                        <Label>Model ID</Label>
                                        <Input
                                            value={newModel.id}
                                            onChange={(e) => setNewModel({ ...newModel, id: e.target.value })}
                                            placeholder="e.g., openai/gpt-4o:free"
                                            className="rounded-full bg-zinc-800/50 border-zinc-700"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Display Name</Label>
                                        <Input
                                            value={newModel.name}
                                            onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
                                            placeholder="e.g., GPT-4o"
                                            className="rounded-full bg-zinc-800/50 border-zinc-700"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <Label>Supports Thinking</Label>
                                        <Switch
                                            checked={newModel.supportsThinking}
                                            onCheckedChange={(checked) => setNewModel({ ...newModel, supportsThinking: checked })}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <Label>Supports Image</Label>
                                        <Switch
                                            checked={newModel.supportsImage}
                                            onCheckedChange={(checked) => setNewModel({ ...newModel, supportsImage: checked })}
                                        />
                                    </div>
                                    <DialogClose asChild>
                                        <Button
                                            onClick={addModel}
                                            className="w-full rounded-full bg-matcha hover:bg-matcha-dark text-black"
                                        >
                                            Add Model
                                        </Button>
                                    </DialogClose>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="space-y-3">
                        <AnimatePresence>
                            {settings.models.map((model) => (
                                <motion.div
                                    key={model.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="flex gap-1">
                                            {model.supportsThinking && (
                                                <div className="p-1.5 rounded-full bg-purple-500/20" title="Supports Thinking">
                                                    <Brain className="w-3.5 h-3.5 text-purple-400" />
                                                </div>
                                            )}
                                            {model.supportsImage && (
                                                <div className="p-1.5 rounded-full bg-blue-500/20" title="Supports Image">
                                                    <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-medium text-sm">{model.name}</p>
                                            <p className="text-xs text-zinc-500 truncate max-w-[200px]">{model.id}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {model.supportsThinking && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="rounded-full text-xs"
                                                onClick={() => toggleModelThinking(model.id)}
                                            >
                                                <Brain className={`w-4 h-4 ${model.supportsThinking ? "text-purple-400" : "text-zinc-600"}`} />
                                            </Button>
                                        )}
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="rounded-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent className="rounded-[2rem] border-zinc-800 bg-zinc-900">
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Remove Model?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Are you sure you want to remove {model.name}?
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => removeModel(model.id)}
                                                        className="rounded-full bg-red-500 hover:bg-red-600"
                                                    >
                                                        Remove
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </motion.section>
            </div>
        </div>
    );
}
