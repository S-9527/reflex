return {pkgs={{source="lazy",name="noice.nvim",file="lazy.lua",spec=function()
return {
  -- nui.nvim can be lazy loaded
  { "MunifTanjim/nui.nvim", lazy = true },
  {
    "folke/noice.nvim",
  },
}

end,dir="/home/anguish/.local/share/nvim/lazy/noice.nvim",},{source="lazy",name="plenary.nvim",file="community",spec={"nvim-lua/plenary.nvim",lazy=true,},dir="/home/anguish/.local/share/nvim/lazy/plenary.nvim",},},version=12,}