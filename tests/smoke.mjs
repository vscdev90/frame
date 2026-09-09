import { computeProject } from '../assets/js/engines/pipeline.js';
import { analyseChange, compareScenarios, WHAT_IFS, budgetSweep } from '../assets/js/engines/consequence.js';

const project = {
  id: 'p1', name: 'Test', building_type: 'detached_house',
  site: { address: 'Zandvoortselaan 12, Bloemendaal', plot_area: 612, orientation: 'north_south', zoning: 'residential' },
  program_answers: { bedrooms: 4, bathrooms: 2, workspace: true, openKitchen: true, separateLiving: true, utility: false, storage: true },
  priorities: { privacy: 0.5, garden: 0.6, sustainability: 0.5 },
  budget: { total: 500000 }
};

const r = computeProject(project);
console.log('budget', r.budget);
console.log('program gross target', r.program.areas.gross_target, 'spaces', r.program.spaces.length);
console.log('directions:', r.directions.map(d => `${d.direction.name} gfa=${d.massing.gfa} cost=${d.cost.total.low}-${d.cost.total.high} feas=${d.feasibility.score} floors=${d.massing.floors} h=${d.massing.height}`).join('\n'));
console.log('massing stats', r.selected.massing_stats.generated, 'valid', r.selected.massing_stats.valid);
console.log('rejections', r.selected.massing_stats.rejected.slice(0,3));
console.log('plan floors', r.selected.floorplans.floors.map(f=>`${f.label}: ${f.spaces.length} spaces`));
console.log('plan issues', r.selected.plan_issues.slice(0,4));
console.log('system', r.selected.construction.selected.name);
console.log('cost items', r.selected.cost.items.map(i=>`${i.label} ${i.quantity}${i.unit} ${i.low}-${i.high}`).join('\n'));
console.log('feasibility', r.selected.feasibility.score, r.selected.feasibility.band, r.selected.feasibility.reasons.length);
const w = analyseChange(project, WHAT_IFS[4].apply(project), WHAT_IFS[4].label);
console.log('WHATIF more glass:', w.impacts.map(i=>`${i.dimension} ${i.direction}: ${i.message}`).join('\n'));
console.log('scenarios', compareScenarios(project).map(s=>`${s.scenario.name} ${s.area}m2 ${s.cost.low}-${s.cost.high} feas ${s.feasibility}`));
console.log('sweep', budgetSweep(project, 300000, 800000, 5).map(s=>`${s.total}:${s.feasibility}${s.fits?'✓':'✗'}`).join(' '));
