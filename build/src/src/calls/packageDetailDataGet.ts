import { ReturnData } from "../route-types/packageDetailDataGet";
import { isEmpty, mapValues } from "lodash";
import { RequestData } from "../route-types/packageGettingStartedToggle";
import { RpcHandlerReturnWithResult } from "../types";
import { dockerVolumeInspect } from "../modules/docker/dockerApi";
import { listContainer } from "../modules/docker/listContainers";
import getHostVolumeSizes from "../modules/docker/getHostVolumeSizes";
import { parseDevicePath } from "../utils/dockerComposeParsers";

/**
 * Toggles the visibility of a getting started block
 * @param show Should be shown on hidden
 */
export default async function packageDetailDataGet({
  id
}: RequestData): RpcHandlerReturnWithResult<ReturnData> {
  if (!id) throw Error("kwarg id must be defined");

  const dnp = await listContainer(id);

  const volDevicePaths: { [volumeName: string]: string } = {};

  for (const vol of dnp.volumes) {
    if (vol.name) {
      const volInfo = await dockerVolumeInspect(vol.name);
      if (
        volInfo.Options &&
        volInfo.Options.device &&
        volInfo.Driver === "local" &&
        volInfo.Options.o === "bind"
      )
        volDevicePaths[vol.name] = volInfo.Options.device;
    }
  }

  // Only call this very expensive function if necessary
  const volumeSizes = isEmpty(volDevicePaths)
    ? {}
    : await getHostVolumeSizes(volDevicePaths);

  const volumes = mapValues(volDevicePaths, (devicePath, volName) => {
    const pathParts = parseDevicePath(devicePath);
    return {
      size: volumeSizes[volName],
      devicePath,
      mountpoint: pathParts ? pathParts.mountpoint : undefined
    };
  });

  return {
    message: `Got volume sizes of ${id}`,
    result: {
      volumes
    }
  };
}
