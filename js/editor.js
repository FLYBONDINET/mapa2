/**
 * Editor: password-gated mode for creating/editing/deleting positions.
 * Positions stored in localStorage:
 * { [posName]: { lat, lng, hdg } }
 */
window.Editor = (() => {
  const STORE_KEY = "saez_atcctrl_positions_v1";
  let enabled = false;

  function getPositions(){
    return Utils.storage.get(STORE_KEY, {});
  }
  function setPositions(obj){
    Utils.storage.set(STORE_KEY, obj);
  }
  function isEnabled(){ return enabled; }

  function requirePassword(){
    return window.UI.modalPassword({
      title: "Ingresar a Modo Editor",
      hint: "Se requiere contraseña para crear/editar posiciones.",
      placeholder: "Contraseña",
      okText: "Entrar",
      cancelText: "Cancelar"
    }).then(pw => {
      if(pw == null) return false;
      return pw === "12345678";
    });
  }

  async function toggle(){
    if(enabled){
      enabled = false;
      return { ok:true, enabled:false };
    }
    const ok = await requirePassword();
    if(!ok){
      window.UI.toast("Contraseña incorrecta.", "danger");
      return { ok:false, enabled:false };
    }
    enabled = true;
    window.UI.toast("Modo Editor activado. Click en el mapa para crear posiciones.", "accent");
    return { ok:true, enabled:true };
  }

  // Prompt for pos + hdg
  function promptPosition({ defaultPos="", defaultHdg=0 }){
    return window.UI.modalPosition({
      title: "Nueva posición",
      pos: defaultPos,
      hdg: defaultHdg
    });
  }

  function addOrUpdate(posName, data){
    const positions = getPositions();
    positions[posName] = data;
    setPositions(positions);
  }

  function remove(posName){
    const positions = getPositions();
    delete positions[posName];
    setPositions(positions);
  }

  return {
    getPositions, setPositions,
    isEnabled, toggle,
    promptPosition,
    addOrUpdate, remove,
    STORE_KEY
  };
})();
