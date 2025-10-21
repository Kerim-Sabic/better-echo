import React, { useEffect, useRef, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Loader2, AlertCircle, Video, RotateCcw } from "lucide-react";
import { listInstancesApi, listDerivedResultsApi } from "../../api/StudiesApi";
import { inferMeasurements2DApi } from "../../api/InferenceApi";

const TASKS = [
  { key: "ivs", label: "IVS" },
  { key: "lvid", label: "LVID" },
  { key: "lvpw", label: "LVPW" },
  { key: "aorta", label: "Aorta" },
  { key: "aortic_root", label: "Ao Root" },
  { key: "la", label: "LA" },
  { key: "rv_base", label: "RV Base" },
  { key: "pa", label: "PA" },
  { key: "ivc", label: "IVC" },
].sort((a,b) => {
  const norm = (s) => (s === "Ao Root" ? "Aortic Root" : s);
  return norm(a.label).localeCompare(norm(b.label));
});

// Global guard across remounts to avoid duplicate scheduling
const gInstances = (typeof window !== 'undefined'
  ? (window.__MEAS2D_INST__ = window.__MEAS2D_INST__ || new Set())
  : new Set());

function toStaticUrl(filePath) {
  if (!filePath) return null;
  if (/^https?:/i.test(filePath)) return filePath;
  const base = (process.env.REACT_APP_API_URL || "").replace(/\/?api\/?$/, "");
  return `${base}/uploads/${filePath}`.replace(/\\/g, "/");
}

const EchoNetMeasurements2D = ({ studyUID }) => {
  const [instances, setInstances] = useState([]);
  const [stateByUID, setStateByUID] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!studyUID) return;
    setLoading(true);
    setError(null);
    Promise.allSettled([listInstancesApi(studyUID), listDerivedResultsApi(studyUID)])
      .then((results) => {
        const instRes = results[0];
        const drsRes = results[1];
        if (instRes.status !== 'fulfilled') {
          throw instRes.reason || new Error('Failed loading instances');
        }
        const inst = instRes.value;
        const drs = drsRes.status === 'fulfilled' ? drsRes.value : [];
        const instancesArr = inst || [];
        setInstances(instancesArr);
        // Preload cached results from DerivedResults
        const nextState = {};
        for (const instance of instancesArr) {
          const uid = instance.sop_instance_uid;
          const id = instance.id;
          const myDRs = (drs || []).filter((d) => d.instance_id === id && typeof d.type === 'string' && d.type.startsWith('EchoNetMeasurements2D_'));
          const results = {};
          for (const d of myDRs) {
            try {
              const payload = JSON.parse(d.value_json || '{}');
              const task = (d.type || '').split('EchoNetMeasurements2D_')[1];
              if (!task) continue;
              const videoUrl = toStaticUrl(payload.outputfile);
              results[task] = {
                videoUrl,
                es: payload.min_length_cm ?? null,
                ed: payload.max_length_cm ?? null,
              };
            } catch (_) {}
          }
          nextState[uid] = { results, selectedTask: Object.keys(results).sort()[0] };
        }
        setStateByUID(nextState);
        setLoading(false);
      })
      .catch((e) => {
        console.error("[Measurements2D] preload error", e);
        setError("Failed to load study instances");
        setLoading(false);
      });
  }, [studyUID]);

  const runTask = async (uid, task, force = false) => {
    setStateByUID((prev) => ({
      ...prev,
      [uid]: { ...(prev[uid] || {}), loading: task, error: null },
    }));
    try {
      const res = await inferMeasurements2DApi(uid, task, force);
      if (res && res.in_progress) {
        // backend says this task is already running elsewhere
        return { inProgress: true };
      }
      const videoUrl = toStaticUrl(res.output_file_mp4);
      setStateByUID((prev) => {
        const prevUID = prev[uid] || {};
        const results = {
          ...(prevUID.results || {}),
          [task]: { videoUrl, es: res.min_length_cm, ed: res.max_length_cm },
        };
        const selectedTask = prevUID.selectedTask || task;
        return { ...prev, [uid]: { ...prevUID, loading: null, error: null, results, selectedTask } };
      });
      return { videoUrl, es: res.min_length_cm ?? null, ed: res.max_length_cm ?? null, inProgress: false };
    } catch (e) {
      console.error("[Measurements2D] inference error", e);
      setStateByUID((prev) => ({
        ...prev,
        [uid]: { ...(prev[uid] || {}), loading: null, error: "Inference failed" },
      }));
      return null;
    }
  };

  // Sequentially process all tasks per instance; reveal content when complete
  const processedRef = useRef(false);
  useEffect(() => {
    if (!instances || instances.length === 0) return;
    if (processedRef.current) return;
    processedRef.current = true;
    const TOTAL = TASKS.length;
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    const pushOverlay = (uid, text = "Thinking...", ms = 500) => {
      setStateByUID((prev) => ({
        ...prev,
        [uid]: { ...(prev[uid] || {}), overlayStatus: text },
      }));
      setTimeout(() => {
        setStateByUID((prev) => ({
          ...prev,
          [uid]: { ...(prev[uid] || {}), overlayStatus: null },
        }));
      }, ms);
    };
    const pollInstance = async (inst, localMap, done) => {
      const uid = inst.sop_instance_uid;
      const instanceId = inst.id;
      let missing = TASKS.map((x) => x.key).filter((k) => !localMap[k]);
      let tries = 0;
      while (missing.length > 0 && tries < 60) { // ~120s if 2s interval
        await delay(2000);
        try {
          const drs = await listDerivedResultsApi(studyUID);
          const myDRs = (drs || []).filter((d) => d.instance_id === instanceId && typeof d.type === 'string' && d.type.startsWith('EchoNetMeasurements2D_'));
          for (const d of myDRs) {
            const key = (d.type || '').split('EchoNetMeasurements2D_')[1];
            if (!key || localMap[key]) continue;
            try {
                const payload = JSON.parse(d.value_json || '{}');
                const videoUrl = toStaticUrl(payload.outputfile);
                localMap[key] = { videoUrl, es: payload.min_length_cm ?? null, ed: payload.max_length_cm ?? null };
                done += 1;
                setStateByUID((prev) => ({
                  ...prev,
                  [uid]: { ...(prev[uid] || {}), results: { ...((prev[uid] || {}).results || {}), [key]: localMap[key] }, progress: done, total: TOTAL },
                }));
            } catch (_) {}
          }
        } catch (_) {}
        missing = TASKS.map((x) => x.key).filter((k) => !localMap[k]);
        tries += 1;
      }
      if (missing.length === 0) {
        const preferred = TASKS.find((x) => x.key === "aorta")?.key;
        const sel = localMap[preferred] ? preferred : (Object.keys(localMap).sort()[0] || null);
        setStateByUID((prev) => ({
          ...prev,
          [uid]: { ...(prev[uid] || {}), selectedTask: sel, status: "", completed: true },
        }));
      }
    };
    (async () => {
      for (const inst of instances) {
        const uid = inst.sop_instance_uid;
        const instKey = `${studyUID}:${uid}`;
        setStateByUID((prev) => ({
          ...prev,
          [uid]: { ...(prev[uid] || {}), progress: 0, total: TOTAL, status: "Preparing...", completed: false },
        }));
        let localMap = { ...((stateByUID[uid] || {}).results || {}) };
        let done = Object.keys(localMap).length;
        setStateByUID((prev) => ({
          ...prev,
          [uid]: { ...(prev[uid] || {}), progress: done, total: TOTAL, status: done ? "Thinking..." : "Preparing..." },
        }));
        await delay(100);

        const alreadyScheduled = gInstances.has(instKey);
        if (!alreadyScheduled) {
          gInstances.add(instKey);
          for (const t of TASKS) {
            if (localMap[t.key]) {
              done += 1;
              setStateByUID((prev) => ({
                ...prev,
                [uid]: { ...(prev[uid] || {}), progress: done, total: TOTAL, status: "Thinking..." },
              }));
              continue;
            }
            pushOverlay(uid);
            setStateByUID((prev) => ({
              ...prev,
              [uid]: { ...(prev[uid] || {}), status: `Calculating ${t.label}`, loading: t.key },
            }));
            const r = await runTask(uid, t.key);
            if (r && !r.inProgress) {
              localMap[t.key] = r;
              done += 1;
            }
            setStateByUID((prev) => ({
              ...prev,
              [uid]: { ...(prev[uid] || {}), progress: done, total: TOTAL, status: "", loading: null },
            }));
          }
        }
        await pollInstance(inst, localMap, done);
      }
    })();
  }, [instances]);

  return (
    <Card className="card-clinical">
      <CardHeader>
        <CardTitle>EchoNet Measurements (2D)</CardTitle>
        <CardDescription>Select a task per instance to render annotated video</CardDescription>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Loading instances...
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center gap-2 py-6 text-red-500">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {!loading && !error && instances.length === 0 && (
          <div className="text-sm text-muted-foreground">No instances in this study.</div>
        )}

        {!loading && !error && instances.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {instances.map((inst) => {
              const uid = inst.sop_instance_uid;
              const s = stateByUID[uid] || {};
              const resMap = s.results || {};
              const selected = s.selectedTask && resMap[s.selectedTask] ? s.selectedTask : Object.keys(resMap)[0];
              const cur = selected ? resMap[selected] : null;
              const isMp4 = cur && cur.videoUrl && cur.videoUrl.toLowerCase().endsWith(".mp4");
              return (
                <div key={uid} className="p-3 border rounded space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">Instance: {uid}</h4>
                  </div>

                  {!s.completed ? (
                    <div className="space-y-2 p-3 text-sm rounded bg-muted/60">
                      <div className="flex items-center justify-between">
                        <div className="text-muted-foreground">{s.overlayStatus ?? s.status ?? "Preparing..."}</div>
                        <div className="font-medium">{Math.round(((s.progress || 0) / (s.total || TASKS.length)) * 100)}%</div>
                      </div>
                      <div className="h-2 w-full bg-muted rounded">
                        <div
                          className="h-2 bg-primary rounded transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.round(((s.progress || 0) / (s.total || TASKS.length)) * 100))}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                  <div className="flex flex-wrap gap-2">
                    {TASKS.map((t) => (
                      <Button
                        key={t.key}
                        size="sm"
                        variant={selected === t.key ? "default" : (resMap[t.key] ? "secondary" : "outline")}
                        disabled={!!s.loading}
                        onClick={() => {
                          if (resMap[t.key]) {
                            setStateByUID((prev) => ({ ...prev, [uid]: { ...(prev[uid] || {}), selectedTask: t.key } }));
                          } else {
                            runTask(uid, t.key);
                          }
                        }}
                      >
                        {s.loading === t.key ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" /> {t.label}
                          </>
                        ) : (
                          t.label
                        )}
                      </Button>
                    ))}
                    {selected && resMap[selected] && (
                      <Button size="sm" variant="ghost" disabled={!!s.loading} onClick={() => runTask(uid, selected, true)}>
                        <RotateCcw className="w-4 h-4 mr-1" /> Re-run
                      </Button>
                    )}
                  </div>) }

                  {s.error && (
                    <div className="flex items-center gap-2 text-sm text-red-500">
                      <AlertCircle className="w-4 h-4" /> {s.error}
                    </div>
                  )}

                  {s.completed && cur && cur.videoUrl && (
                    <div className="space-y-2">
                      {(cur.es != null && cur.ed != null) && (
                        <div className="flex items-center justify-end text-sm text-foreground">
                          <div className="rounded bg-muted px-2 py-1">ES: {cur.es.toFixed(2)} cm • ED: {cur.ed.toFixed(2)} cm</div>
                        </div>
                      )}
                      {isMp4 ? (
                        <video key={`${uid}-${selected}-${cur.videoUrl}`} controls className="w-full rounded shadow">
                          <source key={`${uid}-${selected}-src`} src={cur.videoUrl} type="video/mp4" />
                          Your browser does not support MP4 playback.
                        </video>
                      ) : (
                        <div className="flex items-center p-3 text-sm border rounded text-muted-foreground">
                          <Video className="w-4 h-4 mr-2" /> MP4 video is not available.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EchoNetMeasurements2D;
