export interface OverlapLaneInput {
  id: string
  top: number
  height: number
}

export interface OverlapLaneLayout {
  lane: number
  laneCount: number
  leftPercent: number
  widthPercent: number
}

type IndexedItem<T extends OverlapLaneInput> = {
  item: T
  index: number
  end: number
}

export function allocateOverlapLanes<T extends OverlapLaneInput>(
  items: readonly T[],
): Array<T & OverlapLaneLayout> {
  const sorted = items
    .map((item, index): IndexedItem<T> => ({
      item,
      index,
      end: item.top + item.height,
    }))
    .sort((left, right) => left.item.top - right.item.top || left.index - right.index)

  const allocated = new Array<T & OverlapLaneLayout>(items.length)

  for (let start = 0; start < sorted.length; ) {
    let end = start + 1
    let clusterEnd = sorted[start].end

    while (end < sorted.length && sorted[end].item.top < clusterEnd) {
      clusterEnd = Math.max(clusterEnd, sorted[end].end)
      end += 1
    }

    allocateCluster(sorted.slice(start, end), allocated)
    start = end
  }

  return allocated
}

function allocateCluster<T extends OverlapLaneInput>(
  cluster: Array<IndexedItem<T>>,
  allocated: Array<T & OverlapLaneLayout>,
): void {
  const laneEnds: number[] = []
  const placements = cluster.map((entry) => {
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= entry.item.top)

    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(entry.end)
    } else {
      laneEnds[lane] = entry.end
    }

    return { entry, lane }
  })

  const laneCount = laneEnds.length
  const widthPercent = 100 / laneCount

  for (const { entry, lane } of placements) {
    allocated[entry.index] = {
      ...entry.item,
      lane,
      laneCount,
      leftPercent: lane * widthPercent,
      widthPercent,
    }
  }
}
