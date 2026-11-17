/* Sala de Jitsi Meet embebida (meet.jit.si) para las videollamadas del Plan Profesional.
   La URL de la sala la entrega el servidor solo al cliente dueño y al equipo. */
(function () {
  function open(url) {
    if (!/^https:\/\/meet\.jit\.si\/frioaustral-[0-9a-f-]{36}$/i.test(String(url || ""))) return alert("Sala no válida.");
    close();
    const m = document.createElement("div");
    m.className = "fa-modal fa-jitsi"; m.id = "faJitsi";
    m.innerHTML = `<div class="fa-box glass fa-jitsi-box"><div class="fa-row" style="justify-content:space-between"><b>Videollamada de asesoría</b><span><a class="btn btn-line btn-sm" href="${url}" target="_blank" rel="noopener">Abrir en otra pestaña</a> <button class="btn btn-line btn-sm" type="button" data-jclose>Salir</button></span></div><iframe src="${url}#config.prejoinPageEnabled=true" allow="camera; microphone; fullscreen; display-capture; autoplay" allowfullscreen title="Videollamada Jitsi Meet"></iframe></div>`;
    document.body.appendChild(m);
    m.querySelector("[data-jclose]").onclick = close;
  }
  function close() { const m = document.getElementById("faJitsi"); if (m) m.remove(); }
  window.FAJitsi = { open, close };
})();
