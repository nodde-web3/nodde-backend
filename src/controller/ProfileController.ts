import { NextFunction, Request, Response } from "express";
import { ProfileService, profileService } from "../profile/profile-service";
import { ApiResponse } from "../api/ApiResponse";
import { getObjById, s3DataToBase64String, updateImage } from "../s3/image";
import { loadByNId, put } from "../db/db";
import { subscriptionService, SubscriptionService } from "../subscription/subscription-service";
import { toSuccessResponse, toErrorResponse, ProfileTableName } from "../common";

export interface ProfileController {
    update(req: Request, res: Response, next: NextFunction): Promise<void>
    profile(req: Request, res: Response, next: NextFunction): Promise<void>
}

export class ProfileControllerImpl implements ProfileController {
    constructor(
        readonly profileService: ProfileService,
        readonly subscriptionService: SubscriptionService
    ) { }

    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
        const newProfileData = req.body;
        const profileId = req.body.id;
        if (!profileId) {
            console.log("profileId is null");
            res.send(toErrorResponse("profileId is null"));
            return
        }
    
        const oldProfile = (await loadByNId(ProfileTableName, profileId)).item;
        const logoS3Id = await updateImage(ProfileImageBucket, oldProfile?.logoId, newProfileData.logo)
    
        const profile = {
            id: profileId,
            title: newProfileData.title,
            description: newProfileData.description,
            logoId: logoS3Id,
            socialMediaLinks: newProfileData.socialMediaLinks,
            instant: new Date().getTime().toString(),
        }
    
        console.log('Updating profile');
        try {

            put({
                TableName: ProfileTableName,
                Item: {
                    id: {
                        "N": profile.id,
                    },
                    title: {
                        "S": profile.title
                    },
                    description: {
                        "S": profile.description
                    },
                    logoId: {
                        "S": profile.logoId
                    },
                    socialMediaLinks: {
                        "L": profile.socialMediaLinks
                    },
                    instant: {
                        "N": profile.instant
                    }
                }
            })
    
            res.send(toSuccessResponse(undefined));
        } catch (e) {
            console.error(e)
            res.send(toErrorResponse("internal error"));
        } finally {
            console.log("Profile was updated.");
        }
        next()
    }

    async profile(req: Request, res: Response, next: NextFunction): Promise<void> {

        const profileId = req.body[0].profileId;

        if (!profileId) {
            console.log('Error, profileId is null.');
            res
                .send(ApiResponse.error("", "Error, profileId is null."))
                .status(400)
            return
        }

        const profile = (await loadByNId("Community-profile", profileId)).item

        if (!profile) {
            console.log(`Can't find profile with profileId: ${profileId}`);
            res.send(toErrorResponse(`Can't find profile with profileId: ${profileId}`));
            return
        }

        const logoPromise = getObjById(ProfileImageBucket, profile.logoId)
            .then(res => {
                profile.logo = {
                    id: profile.logoId,
                    base64Image: s3DataToBase64String(res.data)
                }
                profile.logoId = undefined
            });

        const subscriptionsPromise = await this.subscriptionService.loadBriefSubscription(profileId).then(s => profile.subscriptions = s);

        next()
    }
}

const profileController: ProfileController = new ProfileControllerImpl(profileService, subscriptionService)
export { profileController }